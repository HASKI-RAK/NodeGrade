import type { BundledTemplate } from './bundled-template.js';
import { GraphBuilder } from './graph-builder.js';

/**
 * Validation review block (SPEC-0003/FR-021 validation/review).
 *
 * The "second check" from the workshop assignment: an earlier assessment goes in,
 * a reviewer model checks it against the original answer and returns a
 * recommendation. Mirrors the Workshop 3 review stage — original answer plus
 * first assessment assembled into one prompt, system instructions carrying the
 * review policy — without the pizza-specific copy, so it fits any subject.
 *
 * The LLM node carries no explicit `model_ref`: execution substitutes the
 * facilitator's deployment default at run time without persisting it (SPEC-0016).
 */

const REVIEW_INSTRUCTIONS = [
  'Check an AI-generated assessment against the original student answer supplied',
  'below. Do not assume the earlier assessment is correct.',
  '',
  "Check whether the assessment is supported by the student's actual words, whether",
  'the feedback addresses the actual gap, and whether anything misleading was said.',
  '',
  'Return exactly these two lines and nothing else:',
  'RECOMMENDATION: EDUCATOR_REVIEW or KEEP_AS_DRAFT',
  'REASON: one specific sentence tied to the answer or the assessment',
  '',
  'KEEP_AS_DRAFT means only that this review identified no issue. It does not mean',
  'an educator has approved the result.',
].join('\n');

const build = () => {
  const g = new GraphBuilder();

  // Boundary inputs stay unwired: the editor's boundary adapter connects into
  // these input slots, so no internal link may occupy them.
  // Node ids in creation order: 1 answer port, 2 assessment port,
  // 3 review instructions, 4 evidence concat, 5 instructions system prompt,
  // 6 evidence user prompt, 7 concat-object, 8 LLM, 9 output.
  const answerPort = g.concat('Learner answer (block input)', [40, 80]);
  const assessmentPort = g.concat('First assessment (block input)', [40, 220]);
  const instructions = g.textfield(
    'Review instructions (editable)',
    [40, 360],
    REVIEW_INSTRUCTIONS,
    [260, 220],
  );

  const evidence = g.concat('Answer and assessment', [380, 150]);
  g.link(answerPort, 0, evidence, 0);
  g.link(assessmentPort, 0, evidence, 1);
  const instructionsMessage = g.systemPrompt(
    'Review instructions',
    [380, 420],
    instructions,
  );
  const evidenceMessage = g.promptMessage('Review input', [700, 150], evidence);
  const messages = g.concatObject(
    'Review messages',
    [1020, 230],
    instructionsMessage,
    evidenceMessage,
  );
  const model = g.llmForMessages('Review model', [1340, 230], messages);
  g.output('Review recommendation', [1720, 230], model);
  g.group('Validation review', [20, 20, 1980, 600], '#7a3b3b');

  return g.build();
};

export const validationReviewBlock: BundledTemplate = {
  slug: 'validation-review',
  kind: 'BLOCK',
  name: 'Validation review',
  description:
    'Second-checks an earlier assessment against the original answer and recommends educator review or keep-as-draft. Uses the deployment default model — no per-node setup.',
  category: 'Validation',
  tags: ['review', 'validation', 'second-check', 'llm'],
  content: build(),
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
        description: 'The original learner response.',
      },
      {
        key: 'assessment',
        label: 'First assessment',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 2,
        internalSlot: 0,
        required: true,
        description: 'The earlier assessment or feedback draft to review.',
      },
      {
        key: 'instructions',
        label: 'Review instructions',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 5,
        internalSlot: 0,
        required: true,
        description: 'Review policy: what the reviewer checks for.',
      },
      {
        key: 'recommendation',
        label: 'Review recommendation',
        dataType: 'string',
        direction: 'output',
        internalNodeId: 8,
        internalSlot: 0,
        description: 'EDUCATOR_REVIEW or KEEP_AS_DRAFT with a reason.',
      },
    ],
  },
};
