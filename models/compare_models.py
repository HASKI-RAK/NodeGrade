"""Compare embedding models across the workflows this repository actually runs.

    python compare_models.py                      # every model on every scenario
    python compare_models.py --scenario keyword   # one scenario
    python compare_models.py --models BAAI/bge-m3
    python compare_models.py --cascade            # does the choice survive staging?

`calibrate.py` answers "where do the thresholds go" for one model. This answers
"which model, and does it matter" - a different question with a different shape,
because a model that wins on short answers can lose on single keywords.

Four scenarios, each the comparison one node really performs:

    equivalence    text/semantic-equivalence: short answer vs reference answer
    keyword        text/keyword-check: one keyword vs one sentence of an answer
    free-text      models/cosine-similarity: paragraph answer vs reference
    cross-lingual  the same, when answer and reference differ in language

The headline number is ROC AUC, not accuracy. Accuracy depends on a threshold
and every model wants a different one; AUC asks the threshold-free question:
given one correct and one incorrect answer, how often does the model score the
correct one higher? 0.5 is a coin toss. It compares models rather than comparing
someone's threshold choices.
"""

import argparse
import gc
import json
import statistics
import time
from dataclasses import dataclass, field

import numpy as np
from sentence_transformers import CrossEncoder, SentenceTransformer

from calibrate import LEGACY_CUTOFF, NLI_MODEL, PAIRS, hard_check

# Every `keyword` case is written so the keyword does NOT appear literally in
# the sentence: KeywordCheckNode runs a substring test first, so the embedding
# only ever sees what that test could not settle. Measuring it on cases the
# substring test already catches would flatter every model equally.
KEYWORD_PAIRS = [
    ("expressed", "photosynthesis", "Plants convert light into chemical energy stored as sugar.", 1),
    ("expressed", "mitochondria", "The organelles that produce most of the cell's ATP.", 1),
    ("expressed", "oxygen", "The gas released by plants during the light reactions is O2.", 1),
    ("expressed", "evaporation", "Water turns into vapour when it is heated.", 1),
    ("expressed", "gravity", "Objects fall towards the ground because the Earth pulls them.", 1),
    ("expressed", "inflation", "Prices across the economy rose by four percent this year.", 1),
    ("expressed", "democracy", "Citizens elect their representatives in free and fair elections.", 1),
    ("expressed", "catalyst", "The enzyme speeds up the reaction without being consumed.", 1),
    ("expressed", "recursion", "The function calls itself until it reaches the base case.", 1),
    ("expressed", "encryption", "The message is scrambled so that only the recipient can read it.", 1),
    ("expressed", "Sauerstoff", "Die Pflanze gibt bei der Lichtreaktion O2 ab.", 1),
    ("expressed", "Verdunstung", "Wasser wird beim Erhitzen zu Dampf.", 1),
    # Sibling concepts: the sentence is about the neighbouring idea, which is
    # where a relatedness score marks a missing keyword as covered.
    ("sibling", "photosynthesis", "Animals break down glucose to release energy in respiration.", 0),
    ("sibling", "mitochondria", "The nucleus stores the cell's genetic material.", 0),
    ("sibling", "oxygen", "Plants take in carbon dioxide through their stomata.", 0),
    ("sibling", "evaporation", "Water vapour cools and forms droplets on the cold window.", 0),
    ("sibling", "gravity", "A magnet attracts iron filings across the table.", 0),
    ("sibling", "inflation", "Unemployment fell to three percent last quarter.", 0),
    ("sibling", "democracy", "The general seized power and suspended the constitution.", 0),
    ("sibling", "catalyst", "The reaction released a great deal of heat.", 0),
    ("sibling", "recursion", "The loop repeats until the counter reaches ten.", 0),
    ("sibling", "encryption", "The file was compressed to a quarter of its original size.", 0),
    ("sibling", "mass", "The object weighs ten newtons at the surface.", 0),
    ("sibling", "Photosynthese", "Tiere atmen Sauerstoff ein und geben Kohlendioxid ab.", 0),
    ("unrelated", "photosynthesis", "The treaty was signed in nineteen nineteen.", 0),
    ("unrelated", "recursion", "The user interface uses a blue colour scheme.", 0),
    ("unrelated", "Verdunstung", "Der Hund bellt im Garten.", 0),
]

# Paragraph-length answers, which is what `models/cosine-similarity` and the
# similarity-scorer block are pointed at. Longer text gives an embedding more to
# agree on, so the interesting negatives are answers that share the vocabulary
# and reverse the claim.
FREETEXT_PAIRS = [
    (
        "paraphrase",
        "Photosynthesis converts light energy into chemical energy, producing glucose and oxygen from carbon dioxide and water.",
        "Plants use sunlight to turn carbon dioxide and water into sugar, and they give off oxygen as a by-product.",
        1,
    ),
    (
        "paraphrase",
        "A variable declared with let is scoped to the enclosing block, while var is scoped to the enclosing function.",
        "let only exists inside the braces you wrote it in; var leaks out to the whole function around it.",
        1,
    ),
    (
        "paraphrase",
        "Natural selection acts on heritable variation: individuals better suited to their environment leave more offspring, so those traits become more common.",
        "Traits that help an organism survive get passed on more often, so over generations the population shifts towards them.",
        1,
    ),
    (
        "paraphrase",
        "An index speeds up reads by letting the database find rows without scanning the table, at the cost of slower writes and extra storage.",
        "Indexes let queries jump straight to the rows they need instead of reading everything, but every insert has to update them too.",
        1,
    ),
    (
        "paraphrase",
        "Inflation reduces the purchasing power of money over time, so a fixed nominal wage buys fewer goods each year.",
        "When prices keep rising, the same salary covers less than it did before.",
        1,
    ),
    (
        "paraphrase",
        "Die Zellatmung baut Glukose unter Sauerstoffverbrauch ab und setzt dabei Energie in Form von ATP frei.",
        "Beim Abbau von Zucker mit Sauerstoff gewinnt die Zelle Energie, die sie als ATP speichert.",
        1,
    ),
    (
        "paraphrase",
        "HTTP is stateless: each request carries everything the server needs, because the server keeps no memory of earlier requests.",
        "Every HTTP request has to be self-contained, since the server does not remember what happened before.",
        1,
    ),
    # Same vocabulary, reversed or broken claim. This is the expensive failure:
    # a learner who has the words and not the relationship.
    (
        "reversed",
        "Photosynthesis converts light energy into chemical energy, producing glucose and oxygen from carbon dioxide and water.",
        "Photosynthesis absorbs oxygen and releases carbon dioxide, breaking down glucose to produce light.",
        0,
    ),
    (
        "reversed",
        "A variable declared with let is scoped to the enclosing block, while var is scoped to the enclosing function.",
        "A variable declared with var is scoped to the enclosing block, while let is scoped to the enclosing function.",
        0,
    ),
    (
        "reversed",
        "An index speeds up reads by letting the database find rows without scanning the table, at the cost of slower writes and extra storage.",
        "An index speeds up writes by letting the database skip the table, at the cost of slower reads and extra storage.",
        0,
    ),
    (
        "reversed",
        "Die Zellatmung baut Glukose unter Sauerstoffverbrauch ab und setzt dabei Energie in Form von ATP frei.",
        "Die Zellatmung baut ATP unter Energieverbrauch ab und setzt dabei Glukose und Sauerstoff frei.",
        0,
    ),
    (
        "wrong-mechanism",
        "Natural selection acts on heritable variation: individuals better suited to their environment leave more offspring, so those traits become more common.",
        "Organisms develop the traits they need during their lifetime and pass those acquired traits on to their offspring.",
        0,
    ),
    (
        "wrong-mechanism",
        "Inflation reduces the purchasing power of money over time, so a fixed nominal wage buys fewer goods each year.",
        "Inflation raises the purchasing power of money over time, so a fixed nominal wage buys more goods each year.",
        0,
    ),
    (
        "wrong-mechanism",
        "HTTP is stateless: each request carries everything the server needs, because the server keeps no memory of earlier requests.",
        "HTTP keeps a persistent session on the server, so later requests can rely on what earlier ones established.",
        0,
    ),
    (
        "incomplete",
        "An index speeds up reads by letting the database find rows without scanning the table, at the cost of slower writes and extra storage.",
        "An index is a data structure stored alongside the table.",
        0,
    ),
    (
        "incomplete",
        "Photosynthesis converts light energy into chemical energy, producing glucose and oxygen from carbon dioxide and water.",
        "Photosynthesis happens in the chloroplasts of green plants.",
        0,
    ),
    (
        "off-topic",
        "A variable declared with let is scoped to the enclosing block, while var is scoped to the enclosing function.",
        "JavaScript was created in ten days and later standardised as ECMAScript.",
        0,
    ),
    (
        "off-topic",
        "Die Zellatmung baut Glukose unter Sauerstoffverbrauch ab und setzt dabei Energie in Form von ATP frei.",
        "Die Mitose teilt den Zellkern in zwei identische Tochterkerne.",
        0,
    ),
]

# A German answer against an English reference, or the reverse. Every deployment
# that teaches in one language and keeps its rubric in another lands here, and
# an English-only model cannot do it at all.
CROSSLINGUAL_PAIRS = [
    ("same", "Die Erde dreht sich um die Sonne", "The Earth orbits the Sun", 1),
    ("same", "Wasser kocht bei 100 Grad Celsius", "Water boils at 100 degrees Celsius", 1),
    ("same", "Pflanzen brauchen Licht zum Wachsen", "Plants need light in order to grow", 1),
    ("same", "Der Blutdruck steigt", "Blood pressure increases", 1),
    ("same", "Die Zelle teilt sich in zwei Tochterzellen", "The cell divides into two daughter cells", 1),
    ("same", "Sauerstoff wird freigesetzt", "Oxygen is released", 1),
    ("same", "Das Gesetz trat 1949 in Kraft", "The law came into force in 1949", 1),
    (
        "same",
        "Ein Katalysator beschleunigt eine Reaktion, ohne dabei verbraucht zu werden",
        "A catalyst speeds up a reaction without being used up itself",
        1,
    ),
    ("opposite", "Die Erde dreht sich um die Sonne", "The Sun orbits the Earth", 0),
    ("opposite", "Der Blutdruck steigt", "Blood pressure decreases", 0),
    ("opposite", "Sauerstoff wird freigesetzt", "Oxygen is absorbed", 0),
    ("opposite", "Wasser kocht bei 100 Grad Celsius", "Water freezes at 100 degrees Celsius", 0),
    ("number", "Das Gesetz trat 1949 in Kraft", "The law came into force in 1994", 0),
    ("number", "Wasser kocht bei 100 Grad Celsius", "Water boils at 10 degrees Celsius", 0),
    ("entity", "Die Zelle teilt sich in zwei Tochterzellen", "The cell fuses with another cell", 0),
    ("entity", "Pflanzen brauchen Licht zum Wachsen", "Animals need food in order to grow", 0),
    (
        "entity",
        "Ein Katalysator beschleunigt eine Reaktion, ohne dabei verbraucht zu werden",
        "A reactant is consumed as the reaction proceeds",
        0,
    ),
    ("unrelated", "Die Erde dreht sich um die Sonne", "The treaty was signed in Versailles", 0),
]

SCENARIOS = {
    "equivalence": PAIRS,
    "keyword": KEYWORD_PAIRS,
    "free-text": FREETEXT_PAIRS,
    "cross-lingual": CROSSLINGUAL_PAIRS,
}


@dataclass
class ModelSpec:
    """One candidate, configured the way its own model card says to run it.

    Comparing models without their prefixes or task adapters measures the
    configuration rather than the model: `e5` loses ground without its
    instruction, and jina-v3 without `text-matching` runs the wrong adapter.
    """

    name: str
    short: str
    licence: str
    trust_remote_code: bool = False
    task: str = ""
    prompt: str = ""
    notes: str = ""
    encode_kwargs: dict = field(default_factory=dict)


MODELS = [
    ModelSpec(
        "sentence-transformers/all-mpnet-base-v2",
        "mpnet (old default)",
        "Apache-2.0",
        notes="English only",
    ),
    ModelSpec(
        "sentence-transformers/all-MiniLM-L6-v2",
        "MiniLM-L6",
        "Apache-2.0",
        notes="English only, 6 layers",
    ),
    ModelSpec("BAAI/bge-m3", "bge-m3 (default)", "MIT", notes="100+ languages"),
    ModelSpec(
        "Alibaba-NLP/gte-modernbert-base",
        "gte-modernbert",
        "Apache-2.0",
        notes="English only",
    ),
    ModelSpec(
        "intfloat/multilingual-e5-large-instruct",
        "e5-large-instruct",
        "MIT",
        prompt="Instruct: Retrieve semantically similar text.\nQuery: ",
        notes="100 languages",
    ),
    ModelSpec(
        "jinaai/jina-embeddings-v3",
        "jina-v3",
        "CC-BY-NC-4.0",
        trust_remote_code=True,
        task="text-matching",
        notes="NON-COMMERCIAL ONLY",
    ),
]


def auc(scores, labels) -> float:
    """Probability that a positive outscores a negative, ties counting a half.

    Written out rather than imported so the number carries no hidden
    preprocessing: this is the Mann-Whitney statistic, which is what ROC AUC is.
    """
    positives = [s for s, y in zip(scores, labels) if y == 1]
    negatives = [s for s, y in zip(scores, labels) if y == 0]
    if not positives or not negatives:
        return float("nan")
    wins = sum(
        1.0 if p > n else 0.5 if p == n else 0.0 for p in positives for n in negatives
    )
    return wins / (len(positives) * len(negatives))


def best_accuracy(scores, labels):
    """The accuracy of the kindest possible threshold, and that threshold.

    A ceiling a deployment could reach after perfect calibration on these exact
    pairs - never what it reaches by accident, and never a promise about others.
    """
    best, at = 0.0, 0.0
    for candidate in sorted(set(scores)):
        correct = sum((s >= candidate) == (y == 1) for s, y in zip(scores, labels))
        if correct / len(scores) > best:
            best, at = correct / len(scores), candidate
    return best, at


def load(spec: ModelSpec):
    model = SentenceTransformer(spec.name, trust_remote_code=spec.trust_remote_code)
    model.max_seq_length = 512
    return model


def score_scenario(model, spec: ModelSpec, rows):
    """Cosine for every pair, plus the seconds spent encoding."""
    texts = sorted({t for _, left, right, _ in rows for t in (left, right)})
    extra = dict(spec.encode_kwargs)
    if spec.task:
        extra["task"] = spec.task
    if spec.prompt:
        extra["prompt"] = spec.prompt
    started = time.time()
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=16, **extra)
    elapsed = time.time() - started
    lookup = dict(zip(texts, vectors))
    scores = [float(np.dot(lookup[left], lookup[right])) for _, left, right, _ in rows]
    return scores, elapsed


def metrics(scores, labels, elapsed):
    positives = [s for s, y in zip(scores, labels) if y == 1]
    negatives = [s for s, y in zip(scores, labels) if y == 0]
    best, at = best_accuracy(scores, labels)
    # Separation in standard deviations: how far apart the two clouds sit
    # relative to their own spread. Margin can be negative while separation is
    # healthy, which is the difference between "one pair overlaps" and "the
    # classes are on top of each other".
    spread = statistics.pstdev(scores) or 1e-9
    return {
        "auc": auc(scores, labels),
        "best": best,
        "at": at,
        "legacy": sum((s >= LEGACY_CUTOFF) == (y == 1) for s, y in zip(scores, labels))
        / len(scores),
        "margin": min(positives) - max(negatives),
        "separation": (statistics.fmean(positives) - statistics.fmean(negatives)) / spread,
        "seconds": elapsed,
        "scores": scores,
    }


def measure(spec: ModelSpec, scenario_names):
    """Load a model once, score every scenario with it, then let it go.

    Loading per scenario instead costs a reload each time and, with several
    multi-gigabyte candidates in one process, exhausts the Windows paging file
    before the table is finished.
    """
    try:
        model = load(spec)
    except Exception as error:  # noqa: BLE001 - an unusable model is a result
        return {"error": f"{type(error).__name__}: {error}"}
    results = {}
    for scenario in scenario_names:
        rows = SCENARIOS[scenario]
        labels = [label for _, _, _, label in rows]
        try:
            scores, elapsed = score_scenario(model, spec, rows)
            results[scenario] = metrics(scores, labels, elapsed)
        except Exception as error:  # noqa: BLE001
            results[scenario] = {"error": f"{type(error).__name__}: {error}"}
    del model
    gc.collect()
    return results


HEAD = (
    f"{'model':<22}{'AUC':>7}{'best':>7}{'@thr':>7}"
    f"{'acc@.70':>9}{'margin':>9}{'sep':>7}{'enc s':>7}"
)


def row(short: str, result: dict) -> str:
    if "error" in result:
        return f"{short:<22}  unavailable: {result['error']}"
    return (
        f"{short:<22}{result['auc']:>7.3f}{result['best']:>7.0%}{result['at']:>7.2f}"
        f"{result['legacy']:>9.0%}{result['margin']:>+9.3f}"
        f"{result['separation']:>7.2f}{result['seconds']:>7.2f}"
    )


def report(scenario_names, specs, json_path: str = ""):
    """One table per scenario, then the summary that decides anything."""
    collected = {}
    for spec in specs:
        print(f"\n[{spec.short}] loading {spec.name}", flush=True)
        collected[spec.short] = measure(spec, scenario_names)

    for scenario in scenario_names:
        rows = SCENARIOS[scenario]
        accept = sum(label for _, _, _, label in rows)
        print(f"\n### {scenario}  ({accept} accept / {len(rows) - accept} reject)")
        print(HEAD)
        for spec in specs:
            result = collected[spec.short]
            print(row(spec.short, result.get(scenario, result)))

    print("\n### AUC by scenario")
    print(f"{'model':<22}{''.join(f'{s:>15}' for s in scenario_names)}{'mean':>8}")
    for spec in specs:
        result = collected[spec.short]
        values = [
            result.get(s, {}).get("auc", float("nan")) if "error" not in result else float("nan")
            for s in scenario_names
        ]
        cells = "".join(f"{v:>15.3f}" for v in values)
        print(f"{spec.short:<22}{cells}{statistics.fmean(values):>8.3f}")

    if json_path:
        with open(json_path, "w", encoding="utf-8") as handle:
            json.dump(collected, handle, indent=2)


def cascade(specs, low: float, high: float, contra: float, entail: float):
    """Does the embedding still matter once the decision is staged?

    Runs the equivalence scenario through the same five stages as
    `text/semantic-equivalence`, once per embedding, against one shared NLI
    model. Everything but the embedding is held constant, so the spread in this
    table is the whole contribution the embedding makes to a verdict.
    """
    labels = [label for _, _, _, label in PAIRS]
    nli = CrossEncoder(NLI_MODEL, max_length=512)
    id2label = {int(k): str(v).lower() for k, v in nli.model.config.id2label.items()}
    forward = nli.predict([(left, right) for _, left, right, _ in PAIRS], apply_softmax=True)
    backward = nli.predict([(right, left) for _, left, right, _ in PAIRS], apply_softmax=True)
    hard = [hard_check(left, right) for _, left, right, _ in PAIRS]
    settled_by_rules = sum(h is not None for h in hard)

    print(f"\n### equivalence cascade, one NLI model, {len(PAIRS)} pairs")
    print(f"{settled_by_rules} of them never reach the embedding: the rules settle them.")
    print(
        f"{'model':<22}{'cos@.70':>9}{'cascade':>9}{'FP':>5}{'FN':>5}{'cosine decided':>16}"
    )
    for spec in specs:
        try:
            model = load(spec)
            scores, _ = score_scenario(model, spec, PAIRS)
        except Exception as error:  # noqa: BLE001
            print(f"{spec.short:<22}  unavailable: {type(error).__name__}: {error}")
            continue
        correct = fp = fn = by_cosine = 0
        for index, (cosine, label) in enumerate(zip(scores, labels)):
            if hard[index] is not None:
                predicted = hard[index][0]
            elif cosine < low:
                predicted, by_cosine = False, by_cosine + 1
            else:
                probabilities = [
                    {id2label[i]: float(v) for i, v in enumerate(row)}
                    for row in (forward[index], backward[index])
                ]
                if max(p["contradiction"] for p in probabilities) >= contra:
                    predicted = False
                elif min(p["entailment"] for p in probabilities) >= entail:
                    predicted = True
                else:
                    predicted, by_cosine = cosine >= high, by_cosine + 1
            correct += predicted == (label == 1)
            fp += predicted and label == 0
            fn += (not predicted) and label == 1
        legacy = sum((s >= LEGACY_CUTOFF) == (y == 1) for s, y in zip(scores, labels))
        print(
            f"{spec.short:<22}{legacy / len(PAIRS):>9.0%}{correct / len(PAIRS):>9.0%}"
            f"{fp:>5}{fn:>5}{by_cosine:>16}"
        )
        del model


def licences(specs):
    print(f"\n{'model':<22}{'licence':<16}{'repository':<46}notes")
    for spec in specs:
        print(f"{spec.short:<22}{spec.licence:<16}{spec.name:<46}{spec.notes}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="*", help="repository ids, default all")
    parser.add_argument(
        "--scenario", nargs="*", choices=list(SCENARIOS), help="default all"
    )
    parser.add_argument("--cascade", action="store_true", help="staged decision instead")
    parser.add_argument("--json", default="", help="also write every score to this file")
    parser.add_argument("--low", type=float, default=0.60)
    parser.add_argument("--high", type=float, default=0.92)
    parser.add_argument("--contradiction", type=float, default=0.50)
    parser.add_argument("--entailment", type=float, default=0.60)
    args = parser.parse_args()

    chosen = [spec for spec in MODELS if spec.name in args.models] if args.models else MODELS
    if args.models:
        known = {spec.name for spec in MODELS}
        chosen += [
            ModelSpec(name, name.split("/")[-1][:21], "unknown")
            for name in args.models
            if name not in known
        ]
    licences(chosen)
    if args.cascade:
        cascade(chosen, args.low, args.high, args.contradiction, args.entailment)
    else:
        report(args.scenario or list(SCENARIOS), chosen, args.json)
