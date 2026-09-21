import type { BundledTemplate } from './bundled-template.js';
import { GraphBuilder } from './graph-builder.js';

/**
 * Answer classifier block (SPEC-0003/FR-021).
 *
 * The trap this block removes: LLM free text must become a `classifications`
 * output through `utils/strings-to-array`, and the prompt must pin the model to
 * "exactly one of these labels and nothing else" — otherwise the output feeds
 * downstream string matching with prose. Mirrors the WAIE classification stage.
 *
 * The LLM node carries no explicit `model_ref`: execution substitutes the
 * facilitator's deployment default at run time without persisting it (SPEC-0016).
 */

const DEFAULT_LABELS = 'correct, partially correct, incorrect';

const CLASSIFICATION_GUIDANCE = [
  'Read the assessment below and classify the answer.',
  'Reply with exactly one of these labels and nothing else:',
  'correct, partially correct, incorrect.',
].join('\n');

const build = () => {
  const g = new GraphBuilder();

  // Boundary inputs stay unwired: the editor's boundary adapter connects into
  // these input slots, so no internal link may occupy them.
  //
  // The node ids the boundary needs are returned rather than written down: they
  // shift whenever a node is added or removed, and a stale comment is exactly
  // how a boundary port ends up pointing at the wrong slot.
  const assessmentPort = g.concat('Assessment (block input)', [40, 80]);
  const guidancePort = g.concat('Guidance (block input)', [40, 220]);
  const guidance = g.textfield(
    'Classification guidance (editable)',
    [40, 360],
    CLASSIFICATION_GUIDANCE,
    [260, 160],
  );

  const guidanceMessage = g.systemPrompt(
    'Classification prompt',
    [380, 420],
    guidance,
  );
  const promptText = g.concat('Assessment text', [380, 140]);
  g.link(assessmentPort, 0, promptText, 0);
  g.link(guidancePort, 0, promptText, 1);
  // The assessment text reaches the model as text; only the label guidance
  // still needs a `prompt-message`, because it carries the `system` role.
  const model = g.llmWithSystem(
    'Classification model',
    [700, 180],
    guidanceMessage,
    promptText,
    { maxTokens: 64, temperature: 0.1 },
  );
  // Single input wired; the second strings-to-array slot stays empty so the
  // node emits a one-element list.
  const list = g.stringsToArray('Classification list', [1100, 180], model);
  g.output('Classification', [1380, 180], list, 0, 'classifications');
  g.group('Classification', [20, 20, 1640, 560], '#405775');

  return {
    content: g.build(),
    ports: {
      assessment: assessmentPort.id,
      guidance: guidanceMessage.id,
      labels: list.id,
    },
  };
};

const { content, ports } = build();

export const answerClassifierBlock: BundledTemplate = {
  slug: 'answer-classifier',
  kind: 'BLOCK',
  name: 'Answer classifier',
  description:
    'Classifies an assessment text into one of a fixed label set with the language model. Uses the deployment default model — no per-node setup.',
  category: 'Assessment',
  tags: ['classification', 'llm', 'labels'],
  content,
  interfaces: {
    boundary: [
      {
        key: 'assessment',
        label: 'Assessment to classify',
        dataType: 'string',
        direction: 'input',
        internalNodeId: ports.assessment,
        internalSlot: 0,
        required: true,
        description:
          'Assessment text (e.g. a rubric scorer reply) to classify.',
      },
      {
        key: 'guidance',
        label: 'Label guidance',
        dataType: 'string',
        direction: 'input',
        internalNodeId: ports.guidance,
        internalSlot: 0,
        required: true,
        description: `Label set instruction. Defaults to: ${DEFAULT_LABELS}.`,
      },
      {
        key: 'labels',
        label: 'Classification',
        dataType: '[string]',
        direction: 'output',
        internalNodeId: ports.labels,
        internalSlot: 0,
        description: 'Single-element classification list.',
      },
    ],
  },
};
