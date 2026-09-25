import type { BundledTemplate } from './bundled-template.js';
import { GraphBuilder } from './graph-builder.js';

/**
 * Answer equivalence block (SPEC-0003/FR-021 validation family).
 *
 * The trap this block removes is the one `similarity-scorer` cannot: a high
 * cosine score is not a correct answer. Measured on this repository's
 * calibration set, `bge-m3` puts "Yes"/"No" at 0.89 and "Yes"/"Correct" at
 * 0.61 — the wrong answer scores higher than the right one, so any threshold
 * over a similarity score marks the wrong learner correct. Participants who
 * wire `similarity-scorer` into a pass/fail decision hit exactly that.
 *
 * `text/semantic-equivalence` answers the other question. It settles exact
 * matches, yes/no answers and stated quantities by rule, uses the embedding
 * only to reject what is plainly far apart, and asks an entailment model about
 * the rest — the one stage that can tell "increases" from "decreases".
 *
 * Use `similarity-scorer` to *show* a degree of closeness, and this block to
 * *decide* whether an answer counts.
 *
 * Fully deterministic: no language model, so no `model_ref` to configure and no
 * deployment default needed (SPEC-0016 does not apply).
 */

const build = () => {
  const g = new GraphBuilder();

  // Boundary inputs stay unwired: the editor's boundary adapter connects into
  // these input slots, so no internal link may occupy them.
  // Node ids in creation order: 1 answer port, 2 expected port, 3 clean answer,
  // 4 clean expected, 5 equivalence, 6 verdict output, 7 equivalent output,
  // 8 similarity output.
  const answerPort = g.concat('Learner answer (block input)', [40, 80]);
  const expectedPort = g.concat('Expected answer (block input)', [40, 240]);

  // Casing, stray spacing and enclosing punctuation are never the difference
  // between a right and a wrong short answer, and normalising here means the
  // exact-match stage inside the node fires on "Rotation." as well as
  // "rotation".
  const cleanAnswer = g.clean('Normalize answer', [400, 80]);
  g.link(answerPort, 0, cleanAnswer, 0);
  const cleanExpected = g.clean('Normalize expected answer', [400, 260]);
  g.link(expectedPort, 0, cleanExpected, 0);

  const equivalence = g.semanticEquivalence(
    'Semantic equivalence',
    [760, 150],
    cleanAnswer,
    cleanExpected,
  );

  g.output('Equivalent', [1180, 80], equivalence, 0);
  g.output('Similarity', [1180, 220], equivalence, 1, 'score');
  g.output('Decided by', [1180, 360], equivalence, 2);
  g.group('Answer equivalence', [20, 20, 1500, 460], '#6f621f');

  return g.build();
};

const content = build();

export const answerEquivalenceBlock: BundledTemplate = {
  slug: 'answer-equivalence',
  kind: 'BLOCK',
  name: 'Answer equivalence',
  description:
    'Decides whether a learner answer means the same as the expected answer, and reports which stage decided it. Rules settle exact matches, yes/no answers and stated numbers; embeddings reject what is far apart; an entailment model resolves the rest, which is the only stage that separates "increases" from "decreases".\n\nUse this rather than a threshold on Similarity scorer: a high similarity score means related, not correct — "Yes" and "No" score 0.89 against each other. Fully deterministic — no language model involved.',
  category: 'Validation',
  tags: ['similarity', 'entailment', 'equivalence', 'deterministic'],
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
        description: 'The learner response to judge.',
      },
      {
        key: 'expected',
        label: 'Expected answer',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 2,
        internalSlot: 0,
        required: true,
        description: 'The answer the learner response has to match in meaning.',
      },
      {
        key: 'equivalent',
        label: 'Equivalent',
        dataType: 'boolean',
        direction: 'output',
        internalNodeId: 5,
        internalSlot: 0,
        description:
          'True when the answer means the same as the expected answer.',
      },
      {
        key: 'similarity',
        label: 'Similarity',
        dataType: 'number',
        direction: 'output',
        internalNodeId: 5,
        internalSlot: 1,
        description:
          'Cosine similarity, 0–1. Evidence for the verdict, never the verdict itself.',
      },
      {
        key: 'verdict',
        label: 'Decided by',
        dataType: 'string',
        direction: 'output',
        internalNodeId: 5,
        internalSlot: 2,
        description:
          'Which stage decided: exact, polarity-mismatch, number-mismatch, cosine-low, nli-entailment, nli-contradiction, nli-neutral.',
      },
    ],
  },
};
