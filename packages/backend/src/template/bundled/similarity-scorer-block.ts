import type { BundledTemplate } from './bundled-template.js';
import { GraphBuilder } from './graph-builder.js';

/**
 * Similarity scorer block (SPEC-0003/FR-021 consistency check).
 *
 * The trap this block removes: `models/cosine-similarity` takes embedding vectors
 * (`[number]`), not strings. Beginners wire answer and reference strings straight
 * into it and get a confusing type or runtime failure. The correct shape — embed
 * both sides with `models/sentence-transformer`, compare, scale to a percentage —
 * repeats in the Workshop 1 graph and the extended lab, now as one insertable unit.
 *
 * The trap it does *not* remove: this score measures relatedness, not
 * correctness. On the calibration set in
 * `docs/semantic-equivalence-calibration.md`, "Yes" against "No" scores 89 and
 * "Yes" against "Correct" scores 61 — so a threshold on this output marks the
 * wrong learner correct. On paragraph-length answers it is worse than that:
 * `docs/embedding-model-comparison.md` measures six embedding models on
 * free-text answers and none reaches 0.55 ROC AUC, which is close enough to
 * chance that the number carries almost no information about correctness.
 * Show it; do not decide with it. A pass/fail decision belongs in the
 * `answer-equivalence` block, which stages rules, embeddings and entailment
 * instead of thresholding a single number.
 *
 * Fully deterministic: no language model, so no `model_ref` to configure and no
 * deployment default needed (SPEC-0016 does not apply).
 */

const build = () => {
  const g = new GraphBuilder();

  // Boundary inputs stay unwired: the editor's boundary adapter connects into
  // these input slots, so no internal link may occupy them.
  // Node ids in creation order: 1 answer port, 2 reference port,
  // 3 embed answer, 4 embed reference, 5 cosine similarity, 6 scale,
  // 7 percentage, 8 rounded, 9 output.
  const answerPort = g.concat('Learner answer (block input)', [40, 80]);
  const referencePort = g.concat('Reference answer (block input)', [40, 220]);

  const embedAnswer = g.sentenceTransformer('Embed learner answer', [380, 80]);
  g.link(answerPort, 0, embedAnswer, 0);
  const embedReference = g.sentenceTransformer(
    'Embed reference answer',
    [380, 200],
  );
  g.link(referencePort, 0, embedReference, 0);
  const similarity = g.cosineSimilarity(
    'Cosine similarity',
    [700, 140],
    embedAnswer,
    embedReference,
  );
  const scale = g.number('Similarity scale', [700, 260], 100);
  const percentage = g.math(
    'Similarity percentage',
    [980, 140],
    '*',
    similarity,
    scale,
  );
  const rounded = g.precision('Rounded score', [1260, 140], percentage, 1);
  g.output('Similarity score', [1540, 140], rounded, 0, 'score');
  g.group('Similarity', [20, 20, 1800, 340], '#6f621f');

  return g.build();
};

const content = build();

export const similarityScorerBlock: BundledTemplate = {
  slug: 'similarity-scorer',
  kind: 'BLOCK',
  name: 'Similarity scorer',
  description:
    'Compares a learner answer with a reference answer using embeddings and reports a 0–100 similarity score. Fully deterministic — no language model involved.\n\nThe score measures relatedness, not correctness: "Yes" against "No" scores 89. Use it to show how close two texts are, and use the Answer equivalence block when the workflow has to decide whether an answer counts.',
  category: 'Validation',
  tags: ['similarity', 'embedding', 'score', 'deterministic'],
  content,
  interfaces: {
    boundary: [
      {
        key: 'answer',
        label: 'Learner answer',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 1,
        internalSlot: 0,
        required: true,
        description: 'The learner response to compare.',
      },
      {
        key: 'reference',
        label: 'Reference answer',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 2,
        internalSlot: 0,
        required: true,
        description: 'The reference answer to compare against.',
      },
      {
        key: 'score',
        label: 'Similarity score',
        dataType: 'number',
        direction: 'output',
        internalNodeId: 8,
        internalSlot: 0,
        description:
          'Cosine similarity scaled to 0–100, rounded to one decimal.',
      },
    ],
  },
};
