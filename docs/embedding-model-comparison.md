# Which embedding model, measured per workflow

`semantic-equivalence-calibration.md` asks where the thresholds go for one
model. This asks a different question — which model, and how much the answer
matters — and it asks it separately for each comparison the graph actually
performs, because the models do not rank the same way in all four.

Reproduce with `models/compare_models.py`:

```bash
python models/compare_models.py                      # every model, every scenario
python models/compare_models.py --scenario keyword   # one scenario
python models/compare_models.py --cascade            # staged decision instead
```

## The four scenarios

Each is the comparison one node really performs, and each has a different
geometry. A keyword against a sentence is not a short answer against a short
answer, and neither is a paragraph against a paragraph.

| scenario | node | left side | right side | pairs |
|---|---|---|---|---|
| `equivalence` | `text/semantic-equivalence` | short answer | reference answer | 35 |
| `keyword` | `text/keyword-check` | one keyword | one sentence | 27 |
| `free-text` | `models/cosine-similarity` | paragraph answer | reference paragraph | 18 |
| `cross-lingual` | any of them | German answer | English reference | 18 |

`keyword` cases are all written so the keyword does **not** appear literally in
the sentence. `KeywordCheckNode` runs a substring test first, so the embedding
only ever sees what that test could not settle; measuring it on cases the
substring test already catches would flatter every model equally.

Negatives are hard throughout: sibling concepts, reversed claims, changed
numbers, the same vocabulary rearranged. Easy negatives measure nothing.

## The headline number is AUC, not accuracy

Accuracy depends on a threshold, and every model wants a different one — the
best cutoff below ranges from 0.03 to 0.99 across these rows. ROC AUC asks the
threshold-free question: given one correct and one incorrect answer, how often
does the model score the correct one higher? 0.5 is a coin toss. It compares
models rather than comparing someone's threshold choices.

## Results

AUC per scenario. Higher is better; 0.5 is chance.

| model | licence | equivalence | keyword | free-text | cross-lingual | mean |
|---|---|---|---|---|---|---|
| `all-mpnet-base-v2` (old default) | Apache-2.0 | 0.508 | 0.778 | 0.442 | 0.425 | 0.538 |
| `all-MiniLM-L6-v2` | Apache-2.0 | 0.428 | 0.794 | 0.403 | 0.475 | 0.525 |
| `BAAI/bge-m3` (default) | MIT | 0.528 | 0.722 | 0.468 | **1.000** | 0.679 |
| `gte-modernbert-base` | Apache-2.0 | 0.592 | 0.869 | 0.519 | 0.713 | 0.673 |
| `multilingual-e5-large-instruct` | MIT | **0.696** | **0.900** | 0.532 | **1.000** | **0.782** |
| `jina-embeddings-v3` | CC-BY-NC-4.0 | 0.672 | 0.844 | **0.545** | 0.975 | 0.759 |

Each model is configured the way its own card says to run it: `e5` gets its
instruction prefix, `jina-v3` gets `task=text-matching`. Comparing them without
those measures the configuration, not the model.

## Finding 1 — the licensed-only model is not the best one

`jina-embeddings-v3` is the model the CC-BY-NC-4.0 question was about. It does
not win. `intfloat/multilingual-e5-large-instruct` scores higher on three of
four scenarios and on the mean, and it is **MIT**.

Whatever the licence review would have concluded, it is not needed: the
strongest embedding measured here is one any deployment may use.

## Finding 2 — `bge-m3` is the default for one reason, and it is not general quality

On the mean it places third. On `cross-lingual` it is perfect, where the old
English-only default scores **0.425 — worse than a coin toss**, meaning a German
answer against an English reference is scored *backwards*.

| model | cross-lingual AUC |
|---|---|
| `all-mpnet-base-v2` | 0.425 |
| `all-MiniLM-L6-v2` | 0.475 |
| `gte-modernbert-base` | 0.713 |
| `jina-embeddings-v3` | 0.975 |
| `bge-m3`, `multilingual-e5-large-instruct` | 1.000 |

Any deployment teaching in one language and keeping its rubric in another needs
a multilingual model. That is the whole case for the swap, and it is enough.

## Finding 3 — on paragraphs, every model is at chance

The `free-text` column is the one worth staring at:

| model | free-text AUC |
|---|---|
| `all-MiniLM-L6-v2` | 0.403 |
| `all-mpnet-base-v2` | 0.442 |
| `bge-m3` | 0.468 |
| `gte-modernbert-base` | 0.519 |
| `multilingual-e5-large-instruct` | 0.532 |
| `jina-embeddings-v3` | 0.545 |

Nothing clears 0.55. A paragraph that reverses the claim keeps the vocabulary,
and vocabulary is most of what the embedding measures — so a cosine score over
paragraph-length answers carries almost no information about whether the answer
is right. This is not a model problem to be fixed by a better model; six models
across four architectures agree.

`models/cosine-similarity` on a free-text answer is therefore a presentation
signal, not a grading signal. Use `text/semantic-equivalence` or a language
model for the verdict.

## Finding 4 — `bge-m3` is the worst model for keyword checking

| model | keyword AUC | best threshold |
|---|---|---|
| `bge-m3` (default) | 0.722 | 0.56 |
| `all-mpnet-base-v2` | 0.778 | 0.46 |
| `all-MiniLM-L6-v2` | 0.794 | 0.37 |
| `jina-embeddings-v3` | 0.844 | 0.48 |
| `gte-modernbert-base` | 0.869 | 0.66 |
| `multilingual-e5-large-instruct` | 0.900 | 0.80 |

The worker loads one embedding for every node, so this is a cost the default
pays rather than a bug. It is also why `DEFAULT_KEYWORD_THRESHOLD` is 0.6 and
not the 0.7 the node shipped with: the useful cutoffs for a single word against
a sentence sit far below the ones for two short answers, and they move with the
model. An operator who overrides `EMBEDDING_MODEL` should re-measure this
threshold rather than inherit it.

## Finding 5 — staging absorbs most of the difference

The same 35 equivalence pairs, once through raw cosine at the old 0.7 cutoff and
once through all five stages of `text/semantic-equivalence` with one shared NLI
model. Only the embedding changes between rows.

| model | cosine ≥ 0.70 | full cascade | FP | FN | pairs cosine decided |
|---|---|---|---|---|---|
| `multilingual-e5-large-instruct` | 29% | 86% | 3 | 2 | 6 |
| `bge-m3` (default) | 43% | **89%** | 2 | 2 | 10 |
| `all-mpnet-base-v2` | 51% | 86% | 2 | 3 | 13 |
| `gte-modernbert-base` | 51% | 86% | 3 | 2 | 7 |
| `all-MiniLM-L6-v2` | 54% | 80% | 1 | 6 | 17 |
| `jina-embeddings-v3` | 57% | **91%** | 1 | 2 | 13 |

Raw cosine spreads **28 points** across these models. The cascade spreads
**11**. And the ordering inverts: `bge-m3` is the *worst* raw scorer at 43% and
the second best staged at 89%, while `MiniLM` is the best raw scorer and the
worst staged.

Nine of the 35 pairs never reach the embedding at all — the rules settle them —
and of the remainder, cosine decides between 6 and 17 depending on the model,
because a model whose scores cluster tightly leaves more pairs in the band where
entailment has the final word.

This is the measurement behind the invariant in `CLAUDE.md`: embedding
similarity is evidence, never a verdict. Choosing a better embedding is worth a
few points. Staging the decision is worth thirty.

## Why the default stays `bge-m3`

`multilingual-e5-large-instruct` is the better embedding — better mean AUC,
better on three scenarios of four, and MIT. It is not the default, because the
cascade is what ships, and in the cascade it is worse: 86% against 89%, with
**three** false positives against two. A wrong answer marked correct is the
expensive error in grading.

Switch to `e5-large-instruct` if the deployment scores with
`models/cosine-similarity` or `text/keyword-check` rather than with the full
cascade — it is clearly ahead on both. It needs its instruction prefix to reach
these numbers, which the worker does not yet apply automatically:

```yaml
EMBEDDING_MODEL: intfloat/multilingual-e5-large-instruct
```

## Environment caveats

Both facts below are properties of this repository's pinned
`models/requirements.txt` (`transformers==4.46.3`, `sentence-transformers==3.4.1`),
not of the models:

- `jina-embeddings-v3` **fails to load on `transformers` 5.x**:
  `AttributeError: 'XLMRobertaLoRA' object has no attribute 'all_tied_weights_keys'`.
  Its remote code is written against `transformers` 4.x. It works on the pinned
  version, which is what the Docker image installs.
- `gte-modernbert-base` **fails to load on the pinned `transformers` 4.46.3**:
  ModernBERT needs 4.48 or newer. Its numbers above come from a newer
  environment; a deployment would have to unpin `transformers` to use it.

Loading `jina-embeddings-v3` with `EMBEDDING_TRUST_REMOTE_CODE=true` also
downloads and executes code from a **second** repository,
`jinaai/xlm-roberta-flash-implementation`, which the model config points at.
Trusting the model means trusting that repository too.

## Growing the set

35, 27, 18 and 18 pairs are enough to show that the scenarios rank models
differently, that paragraphs are hopeless for every model, and that staging
dominates model choice. They are not enough to certify a model for a specific
course. Add that course's answers to the scenario lists in
`models/compare_models.py` and re-run before changing a default for a real
cohort.
