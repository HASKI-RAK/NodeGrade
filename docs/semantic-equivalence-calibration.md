# Semantic equivalence: what was measured, and why the defaults are what they are

This document records the measurements behind three decisions: which embedding
model the NLP worker loads, why cosine similarity is not used as a grading
criterion on its own, and where the thresholds in
`text/semantic-equivalence` sit.

Reproduce any number here with `models/calibrate.py`, which carries the labelled
pair set and mirrors the rule stages in
`packages/lib/src/nodes/utils/semanticEquivalence.ts`:

```bash
python models/calibrate.py            # embedding models against each other
python models/calibrate.py --cascade  # cosine alone against the full cascade
python models/calibrate.py --grid     # grid-search the thresholds
```

## The pair set

35 labelled pairs of the kind short-answer grading produces, in English and
German, split into paraphrases that should be accepted and six families of
negative that should not: opposites, different numbers, sibling entities
(`mitosis`/`meiosis`), related-but-wrong (`mass`/`weight`), and unrelated text.

The negatives are deliberately hard. Easy negatives measure nothing: any model
separates `photosynthesis` from `the French Revolution`.

## Finding 1 — the problem was never the model

`all-mpnet-base-v2` was replaced because it is English-only and elderly, not
because a better embedding fixes short-answer grading. It does not:

| model | accuracy at 0.70 | best possible accuracy | margin |
|---|---|---|---|
| `sentence-transformers/all-mpnet-base-v2` | 51% | 69% | −0.790 |
| `BAAI/bge-m3` | 43% | 71% | −0.515 |

*Margin* is the worst accepted pair's score minus the best rejected pair's
score. **Both margins are negative**, which means no cosine threshold separates
the two classes — not the shipped 0.7, not any other value. Swapping the model
raises the ceiling from 69% to 71% and halves the overlap, and that is all.

On the pairs that matter most it can look worse. `bge-m3` scores:

```
Yes / No          0.890      Yes / Correct     0.614
true / false      0.908      Ja  / Richtig     0.575
```

The wrong answer outscores the right one. This is not a defect: sentence
embeddings encode *relatedness*, and "Yes" and "No" are as related as two words
get. Grading needs *equivalence*, which is a different question.

`jinaai/jina-embeddings-v3` with its `text-matching` adapter is the strongest
candidate on paper, and is not the default: the weights are CC-BY-NC-4.0, and a
default pointing at them would hand every deployment a licence decision it never
made. It stays selectable through `EMBEDDING_MODEL`, `EMBEDDING_TASK` and
`EMBEDDING_TRUST_REMOTE_CODE` (see `README.md`) for operators whose own use is
non-commercial. The default is `BAAI/bge-m3`: MIT, multilingual over 100+
languages, trained multi-granularity from short phrases to 8192 tokens.

Finding 2 is the reason to expect little from that swap. The embedding is one
stage of five, and the only thing it decides alone is the floor.
`embedding-model-comparison.md` runs six models through this whole cascade and
measures an 11-point spread where raw cosine spreads 28 — and finds that the MIT
`multilingual-e5-large-instruct` outscores jina-v3 regardless, so the licence
question need never be answered.

## Finding 2 — staging the decision is what actually helps

`text/semantic-equivalence` runs five stages, cheapest and most certain first.
Each row is the accuracy over the same 35 pairs:

| decision procedure | correct | false positives | false negatives |
|---|---|---|---|
| cosine ≥ 0.70 (what `KeywordCheckNode` shipped with) | 43% | 14 | 6 |
| cosine ≥ 0.92 | 69% | 2 | 9 |
| rules + cosine ≥ 0.92 | 77% | 1 | 7 |
| rules + cosine floor + entailment | **89%** | 2 | 2 |

The rules are exact match after normalisation, polarity (a bare yes/no answer),
and stated numbers. They carry precisely the cases embeddings get worst, and
they cost nothing: no request leaves the process.

Entailment carries the rest. `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`
(MIT, 100 languages) scores each pair in both directions and is the only stage
that can call a contradiction:

```
increases / decreases                          contradiction 0.995
The reaction is exothermic / ... endothermic   contradiction 0.978
increases / goes up                            entailment    0.987
17 / seventeen                                 entailment    0.892
```

## Finding 3 — a high cosine is not evidence

The cascade uses cosine in the rejecting direction only. The reason is one pair:

```
The Sun orbits the Earth / The Earth orbits the Sun     cosine 0.972
```

Letting a high score accept on its own marks that answer correct. Cosine
therefore has a floor (below it, reject without asking further) and a ceiling
that only breaks a tie the entailment stage left undecided.

## The defaults

Grid search over `low × high × contradiction × entailment` gives a plateau of
89% across `high` from 0.85 to 0.95 and `contradiction` from 0.40 to 0.60. The
two values that matter are `low = 0.60` and `entailment ≥ 0.60`.

| threshold | default | what moves if you change it |
|---|---|---|
| `lowThreshold` | 0.60 | Lower lets more pairs reach the entailment stage. At 0.40 the model accepts `artery`/`vein`, which is a false positive. |
| `highThreshold` | 0.92 | Only decides entailment-neutral pairs, and the fallback when the worker has no NLI model. |
| contradiction | 0.50 | Flat between 0.40 and 0.60; contradictions score above 0.97 or below 0.15, rarely in between. |
| entailment | 0.60 | The one sensitive value. 0.50 accepts `speed`/`acceleration`; 0.70 rejects `The Earth rotates on its axis`/`The Earth turns around itself`. |

Defaults favour precision. In grading, a wrong answer marked correct costs more
than a right answer sent back for review.

## What it still gets wrong

Four of 35, and they are worth knowing before trusting the node:

| pair | verdict | why |
|---|---|---|
| `photosynthesis` / `the production of glucose using light` | rejected | The NLI model reads a term against its definition as neutral, not entailment. Compare answers with reference *answers*, not with definitions of terms. |
| `mitochondria` / `the powerhouse of the cell` | rejected | Cosine 0.456, below the floor. A figurative paraphrase is far apart in embedding space. |
| `The Sun orbits the Earth` / `The Earth orbits the Sun` | accepted | The NLI model reports entailment at 0.958. Identical vocabulary in reversed roles defeats it. |
| `mass` / `weight` | accepted | Entailment 0.964. Defensible in everyday language, wrong in physics. |

The last two are the expensive kind. Neither an embedding nor an NLI model
knows which subject's conventions apply, which is the standing argument for
keeping a language-model assessment stage in a grading workflow rather than
replacing it with this node.

## Growing the set

35 pairs is enough to show that cosine alone fails and that staging works. It is
not enough to certify a threshold for a specific course. Before changing a
default for a real cohort, add that cohort's answers to `PAIRS` in
`models/calibrate.py` and re-run `--grid`; a few hundred labelled pairs from the
task at hand beat any number transplanted from here.
