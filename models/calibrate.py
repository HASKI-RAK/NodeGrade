"""Measure embedding models and the equivalence cascade on short-answer pairs.

    python calibrate.py                      # compare mpnet against the current model
    python calibrate.py --cascade            # cosine alone against the full cascade
    python calibrate.py BAAI/bge-m3 intfloat/multilingual-e5-large-instruct

Produced the numbers in `docs/semantic-equivalence-calibration.md`. The pair set
below is the artefact worth growing: every threshold and every model choice in
this repository is only as good as the cases listed here, so add the pairs your
own tasks produce before trusting a default.

The rule stages mirror `packages/lib/src/nodes/utils/semanticEquivalence.ts`. If
one side changes, change the other, or the measurement stops describing what the
graph does.
"""

import argparse
import itertools
import re
import time
import unicodedata

import numpy as np
from sentence_transformers import CrossEncoder, SentenceTransformer

EMBEDDING_MODEL = "BAAI/bge-m3"
BASELINE_MODEL = "sentence-transformers/all-mpnet-base-v2"
NLI_MODEL = "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"

# The cutoff `KeywordCheckNode` shipped with before any of this was measured.
LEGACY_CUTOFF = 0.70

# (category, left, right, label); label 1 = a grader would accept these as the
# same answer. The negatives are deliberately *hard*: pairs that are strongly
# related and still wrong are the ones a similarity score cannot separate.
PAIRS = [
    ("paraphrase", "Yes", "Correct", 1),
    ("paraphrase", "photosynthesis", "the production of glucose using light", 1),
    ("paraphrase", "The Earth rotates on its axis", "The Earth turns around itself", 1),
    ("paraphrase", "increases", "goes up", 1),
    ("paraphrase", "mitochondria", "the powerhouse of the cell", 1),
    ("paraphrase", "17", "seventeen", 1),
    ("paraphrase", "Die Erde dreht sich um ihre Achse", "Die Erde rotiert", 1),
    ("paraphrase", "Ja", "Richtig", 1),
    ("paraphrase", "H2O", "water", 1),
    ("paraphrase", "it gets warmer", "the temperature rises", 1),
    ("opposite", "Yes", "No", 0),
    ("opposite", "increases", "decreases", 0),
    ("opposite", "true", "false", 0),
    ("opposite", "Ja", "Nein", 0),
    ("opposite", "The value goes up", "The value goes down", 0),
    ("opposite", "richtig", "falsch", 0),
    ("opposite", "it gets warmer", "it gets colder", 0),
    ("opposite", "The reaction is exothermic", "The reaction is endothermic", 0),
    ("number", "17", "42", 0),
    ("number", "3.14", "2.71", 0),
    ("number", "twelve", "twenty", 0),
    ("number", "The answer is 5 metres", "The answer is 50 metres", 0),
    ("entity", "mitosis", "meiosis", 0),
    ("entity", "Berlin", "Munich", 0),
    ("entity", "nitrogen", "oxygen", 0),
    ("entity", "photosynthesis", "cellular respiration", 0),
    ("entity", "Hypothese", "These", 0),
    ("entity", "artery", "vein", 0),
    ("related-wrong", "The Sun orbits the Earth", "The Earth orbits the Sun", 0),
    ("related-wrong", "rotation", "revolution", 0),
    ("related-wrong", "mass", "weight", 0),
    ("related-wrong", "speed", "acceleration", 0),
    ("unrelated", "photosynthesis", "the French Revolution", 0),
    ("unrelated", "Yes", "banana", 0),
    ("unrelated", "Die Erde dreht sich", "Der Hund bellt", 0),
]

AFFIRMATIVE = {
    "yes", "yeah", "yep", "y", "true", "correct", "right",
    "ja", "jawohl", "richtig", "wahr", "stimmt", "zutreffend",
}
NEGATIVE = {
    "no", "nope", "n", "false", "incorrect", "wrong",
    "nein", "falsch", "unwahr", "nicht richtig", "nicht wahr", "trifft nicht zu",
}

_EDGE = r"""[.,;:!?'"`´“”„‚‘’()\[\]{}-]"""
_NUMBER = re.compile(r"-?\d[\d.,]*")


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.sub(r"[\s ]+", " ", value).strip()
    return re.sub(rf"^{_EDGE}+|{_EDGE}+$", "", value).strip()


def numbers(value: str):
    found = []
    for match in _NUMBER.findall(value):
        last_comma, last_dot = match.rfind(","), match.rfind(".")
        decimal = "," if last_comma > last_dot else "."
        keep_at = last_comma if decimal == "," else last_dot
        cleaned = "".join(
            character
            for index, character in enumerate(match)
            if character not in ".," or (character == decimal and index == keep_at)
        ).replace(",", ".")
        try:
            found.append(float(cleaned))
        except ValueError:
            pass
    return found


def ambiguous_number(value: str) -> bool:
    """`1.000` is a thousand to a German reader and one to an English one."""
    return any(re.fullmatch(r"-?\d{1,3}[.,]\d{3}", m) for m in _NUMBER.findall(value))


def bare_number(value: str) -> bool:
    return re.fullmatch(r"[-\d.,\s]*", value) is not None and any(
        character.isdigit() for character in value
    )


def hard_check(answer: str, expected: str):
    """(equivalent, reason), or None when a model has to decide."""
    a, e = normalize(answer), normalize(expected)
    if not a or not e:
        return None
    if a == e:
        return True, "exact"
    pa = "affirmative" if a in AFFIRMATIVE else "negative" if a in NEGATIVE else None
    pe = "affirmative" if e in AFFIRMATIVE else "negative" if e in NEGATIVE else None
    if pa and pe:
        return (pa == pe), ("polarity-match" if pa == pe else "polarity-mismatch")
    if not ambiguous_number(a) and not ambiguous_number(e):
        na, ne = numbers(a), numbers(e)
        if na and ne:
            if na != ne:
                return False, "number-mismatch"
            if bare_number(a) and bare_number(e):
                return True, "number-match"
    return None


def embed(name: str):
    model = SentenceTransformer(name)
    model.max_seq_length = 512
    texts = sorted({t for _, left, right, _ in PAIRS for t in (left, right)})
    started = time.time()
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=16)
    elapsed = time.time() - started
    return model, dict(zip(texts, vectors)), elapsed


def compare_models(names):
    print(f"{'model':<46}{'@0.70':>7}{'best':>7}{'thr':>7}{'margin':>9}{'enc s':>7}")
    for name in names:
        model, vectors, elapsed = embed(name)
        rows = [
            (label, float(np.dot(vectors[left], vectors[right])))
            for _, left, right, label in PAIRS
        ]
        at_legacy = sum(
            (score >= LEGACY_CUTOFF) == (label == 1) for label, score in rows
        ) / len(rows)
        best_threshold, best = 0.0, 0.0
        for candidate in sorted({score for _, score in rows}):
            accuracy = sum(
                (score >= candidate) == (label == 1) for label, score in rows
            ) / len(rows)
            if accuracy > best:
                best_threshold, best = candidate, accuracy
        positives = [score for label, score in rows if label == 1]
        negatives = [score for label, score in rows if label == 0]
        # A negative margin means no single cutoff separates the two classes.
        margin = min(positives) - max(negatives)
        print(
            f"{name:<46}{at_legacy:>6.0%}{best:>7.0%}{best_threshold:>7.3f}"
            f"{margin:>+9.3f}{elapsed:>7.2f}"
            f"  dims {model.get_sentence_embedding_dimension()}"
        )


def compare_cascade(low: float, high: float, contra: float, entail: float):
    _, vectors, _ = embed(EMBEDDING_MODEL)
    nli = CrossEncoder(NLI_MODEL, max_length=512)
    id2label = {int(k): str(v).lower() for k, v in nli.model.config.id2label.items()}
    forward = nli.predict([(l, r) for _, l, r, _ in PAIRS], apply_softmax=True)
    backward = nli.predict([(r, l) for _, l, r, _ in PAIRS], apply_softmax=True)

    print(
        f"{'category':<14}{'want':>5}{'cos':>7}{'cos>=.7':>9}{'cascade':>9}"
        f"  {'decided by':<20}pair"
    )
    cosine_correct = cascade_correct = 0
    for (category, left, right, label), f, b in zip(PAIRS, forward, backward):
        cosine = float(np.dot(vectors[left], vectors[right]))
        legacy = cosine >= LEGACY_CUTOFF

        hard = hard_check(left, right)
        if hard is not None:
            predicted, reason = hard
        elif cosine < low:
            predicted, reason = False, "cosine-low"
        else:
            probabilities = [
                {id2label[i]: float(v) for i, v in enumerate(row)} for row in (f, b)
            ]
            worst_contradiction = max(p["contradiction"] for p in probabilities)
            both_entail = min(p["entailment"] for p in probabilities)
            if worst_contradiction >= contra:
                predicted, reason = False, "nli-contradiction"
            elif both_entail >= entail:
                predicted, reason = True, "nli-entailment"
            else:
                predicted, reason = cosine >= high, "nli-neutral"

        cosine_correct += legacy == (label == 1)
        cascade_correct += predicted == (label == 1)
        mark = lambda ok: " " if ok else "X"  # noqa: E731
        print(
            f"{category:<14}{label:>5}{cosine:>7.3f}"
            f"{str(legacy):>8}{mark(legacy == (label == 1))}"
            f"{str(predicted):>8}{mark(predicted == (label == 1))}"
            f"  {reason:<20}{left[:26]!r} / {right[:26]!r}"
        )
    total = len(PAIRS)
    print(f"\ncosine >= {LEGACY_CUTOFF}: {cosine_correct}/{total}")
    print(f"cascade:        {cascade_correct}/{total}")


def grid_search():
    """Every threshold combination, so a default is a measurement not a guess."""
    _, vectors, _ = embed(EMBEDDING_MODEL)
    nli = CrossEncoder(NLI_MODEL, max_length=512)
    id2label = {int(k): str(v).lower() for k, v in nli.model.config.id2label.items()}
    forward = nli.predict([(l, r) for _, l, r, _ in PAIRS], apply_softmax=True)
    backward = nli.predict([(r, l) for _, l, r, _ in PAIRS], apply_softmax=True)
    rows = []
    for (category, left, right, label), f, b in zip(PAIRS, forward, backward):
        probabilities = [
            {id2label[i]: float(v) for i, v in enumerate(row)} for row in (f, b)
        ]
        rows.append(
            {
                "label": label,
                "hard": hard_check(left, right),
                "cosine": float(np.dot(vectors[left], vectors[right])),
                "contradiction": max(p["contradiction"] for p in probabilities),
                "entailment": min(p["entailment"] for p in probabilities),
            }
        )

    print(f"{'low':>5}{'high':>6}{'con':>6}{'ent':>6}{'acc':>7}{'FP':>4}{'FN':>4}")
    results = []
    for low, high, contra, entail in itertools.product(
        [0.30, 0.40, 0.50, 0.60], [0.85, 0.90, 0.92, 0.95],
        [0.40, 0.50, 0.60], [0.50, 0.60, 0.70, 0.80],
    ):
        predictions = []
        for row in rows:
            if row["hard"] is not None:
                predictions.append(row["hard"][0])
            elif row["cosine"] < low:
                predictions.append(False)
            elif row["contradiction"] >= contra:
                predictions.append(False)
            elif row["entailment"] >= entail:
                predictions.append(True)
            else:
                predictions.append(row["cosine"] >= high)
        correct = sum(p == (r["label"] == 1) for p, r in zip(predictions, rows))
        fp = sum(p and r["label"] == 0 for p, r in zip(predictions, rows))
        fn = sum((not p) and r["label"] == 1 for p, r in zip(predictions, rows))
        results.append((correct, -fp, low, high, contra, entail, fp, fn))
    results.sort(reverse=True)
    for correct, _, low, high, contra, entail, fp, fn in results[:10]:
        print(
            f"{low:>5.2f}{high:>6.2f}{contra:>6.2f}{entail:>6.2f}"
            f"{correct / len(rows):>7.0%}{fp:>4}{fn:>4}"
        )


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("models", nargs="*", help="embedding models to compare")
parser.add_argument("--cascade", action="store_true", help="cosine vs the full cascade")
parser.add_argument("--grid", action="store_true", help="grid-search the thresholds")
parser.add_argument("--low", type=float, default=0.60)
parser.add_argument("--high", type=float, default=0.92)
parser.add_argument("--contradiction", type=float, default=0.50)
parser.add_argument("--entailment", type=float, default=0.60)
args = parser.parse_args()

if args.grid:
    grid_search()
elif args.cascade:
    compare_cascade(args.low, args.high, args.contradiction, args.entailment)
else:
    compare_models(args.models or [BASELINE_MODEL, EMBEDDING_MODEL])
