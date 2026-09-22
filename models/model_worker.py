"""NLP worker for NodeGrade: embeddings, pair similarity and entailment.

Why this service has the shape it has:

* `all-mpnet-base-v2` encoded *relatedness*, not *equivalence*. Short answers are
  exactly where that distinction matters: "Yes"/"No", "increases"/"decreases" and
  "mitosis"/"meiosis" are near-neighbours in that space even though a grader must
  separate them. `BAAI/bge-m3` is trained multi-granularity (short phrase up to
  8192 tokens) over 100+ languages and separates those pairs better.
* Every model here is named by an environment variable, never pinned in code.
  This service downloads weights at runtime and no weights ship in the
  repository, so the default has to be one every deployment may use — `bge-m3`
  and the NLI cross-encoder are both MIT — while an operator who has checked
  the terms for their own deployment can point `EMBEDDING_MODEL` anywhere,
  including at non-commercially licensed weights such as
  `jinaai/jina-embeddings-v3` (CC-BY-NC-4.0). See the worker section of
  `README.md`.
* Cosine alone is still not a correctness criterion. `/entailment` exposes a
  natural-language-inference cross-encoder so an ambiguous cosine band can be
  resolved by a model that distinguishes entailment from contradiction. It loads
  lazily: a deployment that never asks for it never pays the memory.

Endpoints:
    GET  /health              service and model status
    POST /sentence_embedding  {"sentence": str | [str]} -> [float] | [[float]]
    POST /similarity          {"source": str, "targets": [str]} -> {"scores": [...]}
    POST /entailment          {"premise": str, "hypothesis": str} | {"pairs": [[p, h]]}
"""

import os
import threading
from typing import Optional

import dotenv
import flask
import numpy
from flask_cors import CORS
from huggingface_hub import snapshot_download
from sentence_transformers import SentenceTransformer

dotenv.load_dotenv()

# Multilingual, multi-granularity, MIT licensed. Override to trade quality for
# speed (`sentence-transformers/all-MiniLM-L6-v2`), to pin an English-only model
# (`Alibaba-NLP/gte-modernbert-base`), or to run weights whose licence only the
# operator can accept (`jinaai/jina-embeddings-v3`, which also needs
# EMBEDDING_TRUST_REMOTE_CODE=true and EMBEDDING_TASK=text-matching).
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-m3")
# bge-m3 advertises 8192 tokens. Short-answer grading never needs that, and the
# cap bounds worst-case latency on CPU deployments.
EMBEDDING_MAX_SEQ_LENGTH = int(os.environ.get("EMBEDDING_MAX_SEQ_LENGTH", "512"))
# Some repositories ship their architecture as Python next to the weights, and
# transformers executes it on load. That is remote code running with this
# process's privileges, so it stays opt-in and off by default: turning it on is
# a statement that the specific repository in EMBEDDING_MODEL is trusted.
EMBEDDING_TRUST_REMOTE_CODE = os.environ.get(
    "EMBEDDING_TRUST_REMOTE_CODE", ""
).strip().lower() in ("1", "true", "yes", "on")
# Task-conditioned models (jina-v3 and its LoRA adapters, the `e5` instruct
# family) encode differently per task and are markedly worse without the right
# one. `text-matching` is the task that means "are these two texts equivalent".
# Empty for models that take no task argument, which is most of them.
EMBEDDING_TASK = os.environ.get("EMBEDDING_TASK", "").strip()
# XNLI-trained multilingual cross-encoder, MIT licensed. Set to an empty string
# to disable /entailment entirely.
NLI_MODEL = os.environ.get(
    "NLI_MODEL", "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"
)
HF_CACHE_DIR = os.environ.get("HF_HOME", "/models-cache")

# sentence-transformers otherwise fetches every alternate runtime export in a
# repository (ONNX, OpenVINO, TensorFlow) before the service can start.
_IGNORED_EXPORTS = ["*.onnx", "*.ot", "*.h5", "onnx/*", "openvino/*"]


def _download(repo_id: str) -> str:
    return snapshot_download(
        repo_id=repo_id,
        cache_dir=HF_CACHE_DIR,
        ignore_patterns=_IGNORED_EXPORTS,
    )


model = SentenceTransformer(
    _download(EMBEDDING_MODEL), trust_remote_code=EMBEDDING_TRUST_REMOTE_CODE
)

if EMBEDDING_TASK:
    # sentence-transformers forwards unknown keywords to the module's forward
    # pass rather than rejecting them, so a task a model does not implement is
    # accepted and quietly ignored. Encoding the same text twice is the only
    # honest test: if the task changed nothing, it is not in effect, and an
    # operator who set it deserves to learn that at boot rather than never.
    try:
        _plain = model.encode("probe", normalize_embeddings=True)
        _tasked = model.encode("probe", normalize_embeddings=True, task=EMBEDDING_TASK)
        _applied = not numpy.allclose(_plain, _tasked)
    except TypeError as error:
        raise SystemExit(
            f"EMBEDDING_TASK={EMBEDDING_TASK!r} was rejected by {EMBEDDING_MODEL}: "
            f"{error}. Leave EMBEDDING_TASK empty for this model."
        ) from error
    if not _applied:
        raise SystemExit(
            f"EMBEDDING_TASK={EMBEDDING_TASK!r} had no effect on {EMBEDDING_MODEL}: "
            f"the same text encodes identically with and without it. Either the "
            f"model takes no task, or this is not one of its task names."
        )

model.max_seq_length = EMBEDDING_MAX_SEQ_LENGTH
EMBEDDING_DIMENSIONS = model.get_sentence_embedding_dimension()
print(
    f"Embedding model loaded: {EMBEDDING_MODEL} "
    f"({EMBEDDING_DIMENSIONS} dimensions, max {EMBEDDING_MAX_SEQ_LENGTH} tokens"
    + (f", task {EMBEDDING_TASK}" if EMBEDDING_TASK else "")
    + (", remote code trusted" if EMBEDDING_TRUST_REMOTE_CODE else "")
    + ")",
    flush=True,
)

# The cross-encoder is loaded on first use, behind a lock so two concurrent
# requests cannot both pay the load.
_nli_lock = threading.Lock()
_nli_model = None
_nli_error: Optional[str] = None


def _load_nli():
    """Return the NLI cross-encoder, loading it on first call.

    Raises RuntimeError when the model is disabled or previously failed to load,
    so callers can answer 503 and let the graph fall back to cosine alone.
    """
    global _nli_model, _nli_error
    if not NLI_MODEL:
        raise RuntimeError("NLI model is disabled (NLI_MODEL is empty)")
    if _nli_model is not None:
        return _nli_model
    with _nli_lock:
        if _nli_model is not None:
            return _nli_model
        if _nli_error is not None:
            raise RuntimeError(_nli_error)
        try:
            from sentence_transformers import CrossEncoder

            _nli_model = CrossEncoder(_download(NLI_MODEL), max_length=512)
            print(f"NLI model loaded: {NLI_MODEL}", flush=True)
        except Exception as error:  # noqa: BLE001 - reported to the caller as 503
            _nli_error = f"Failed to load NLI model {NLI_MODEL}: {error}"
            raise RuntimeError(_nli_error) from error
        return _nli_model


app = flask.Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


def _bad_request(message: str):
    return flask.jsonify({"error": message}), 400


def _is_string_list(value) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _is_pair(value) -> bool:
    return (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and all(isinstance(text, str) for text in value)
    )


def _encode(sentences):
    """Encode to unit vectors, so a dot product is already the cosine.

    `task` is only forwarded when configured: passing it to a model that takes
    no task argument is a TypeError, and most models take none.
    """
    if EMBEDDING_TASK:
        return model.encode(sentences, normalize_embeddings=True, task=EMBEDDING_TASK)
    return model.encode(sentences, normalize_embeddings=True)


@app.route("/sentence_embedding", methods=["POST"])
def sentence_embedding():
    """Embed one sentence, or a batch of them in a single forward pass.

    A string in still yields a flat vector out: `models/sentence-transformer`
    and every stored graph using it depend on that shape.
    """
    payload = flask.request.get_json(silent=True) or {}
    sentence = payload.get("sentence")
    if isinstance(sentence, str):
        return flask.jsonify(_encode(sentence).tolist())
    if _is_string_list(sentence):
        if not sentence:
            return flask.jsonify([])
        return flask.jsonify(_encode(sentence).tolist())
    return _bad_request("Field 'sentence' must be a string or a list of strings")


@app.route("/similarity", methods=["POST"])
def similarity():
    """Score one source against many targets in a single round trip.

    The node-side alternative is one `/sentence_embedding` call per target plus
    cosine in JavaScript, which costs a request per keyword and re-embeds the
    source every time.
    """
    payload = flask.request.get_json(silent=True) or {}
    source = payload.get("source")
    targets = payload.get("targets")
    if not isinstance(source, str):
        return _bad_request("Field 'source' must be a string")
    if not _is_string_list(targets):
        return _bad_request("Field 'targets' must be a list of strings")
    if not targets:
        return flask.jsonify({"scores": [], "model": EMBEDDING_MODEL})

    embeddings = _encode([source, *targets])
    source_embedding = embeddings[0]
    scores = [float(source_embedding @ target) for target in embeddings[1:]]
    return flask.jsonify({"scores": scores, "model": EMBEDDING_MODEL})


@app.route("/entailment", methods=["POST"])
def entailment():
    """Classify premise/hypothesis pairs as entailment, neutral or contradiction.

    This resolves the ambiguous cosine band: "increases" and "decreases" sit
    close in embedding space but contradict each other, and only this stage can
    say so.
    """
    payload = flask.request.get_json(silent=True) or {}
    pairs = payload.get("pairs")
    if pairs is None:
        premise = payload.get("premise")
        hypothesis = payload.get("hypothesis")
        if not isinstance(premise, str) or not isinstance(hypothesis, str):
            return _bad_request(
                "Provide 'premise' and 'hypothesis' strings, or a 'pairs' list"
            )
        pairs = [[premise, hypothesis]]
    if not isinstance(pairs, list) or not all(_is_pair(pair) for pair in pairs):
        return _bad_request("Field 'pairs' must be a list of [premise, hypothesis]")
    if not pairs:
        return flask.jsonify({"results": [], "model": NLI_MODEL})

    try:
        cross_encoder = _load_nli()
    except RuntimeError as error:
        return flask.jsonify({"error": str(error)}), 503

    scores = cross_encoder.predict(
        [(pair[0], pair[1]) for pair in pairs], apply_softmax=True
    )
    # Label order differs between NLI checkpoints; read it off the config rather
    # than assuming the XNLI ordering.
    id2label = cross_encoder.model.config.id2label
    results = []
    for row in scores:
        probabilities = {
            str(id2label[index]).lower(): float(value) for index, value in enumerate(row)
        }
        label = max(probabilities, key=probabilities.get)
        results.append({**probabilities, "label": label})
    return flask.jsonify({"results": results, "model": NLI_MODEL})


@app.route("/health", methods=["GET"])
def health_check():
    return flask.jsonify(
        {
            "status": "ok",
            "embeddingModel": EMBEDDING_MODEL,
            "dimensions": EMBEDDING_DIMENSIONS,
            "maxSequenceLength": EMBEDDING_MAX_SEQ_LENGTH,
            # An operator who has overridden the model needs to see which one
            # actually loaded, and with which task, before trusting a score.
            "embeddingTask": EMBEDDING_TASK or None,
            "trustRemoteCode": EMBEDDING_TRUST_REMOTE_CODE,
            "nliModel": NLI_MODEL or None,
            "nliLoaded": _nli_model is not None,
        }
    )


if __name__ == "__main__":
    app.run(debug=False, port=int(os.environ.get("PORT", "8002")), host="0.0.0.0")
