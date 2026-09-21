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
  // Node ids in creation order: 1 assessment port, 2 guidance port,
  // 3 guidance text, 4 classification system prompt, 5 assessment user prompt,
  // 6 concat-object, 7 LLM, 8 strings-to-array, 9 output.
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
  const assessmentMessage = g.promptMessage(
    'Assessment to classify',
    [700, 140],
    promptText,
  );
  const messages = g.concatObject(
    'Classification messages',
    [1020, 220],
    guidanceMessage,
    assessmentMessage,
  );
  const model = g.llmForMessages(
    'Classification model',
    [1340, 180],
    messages,
    { maxTokens: 64, temperature: 0.1 },
  );
  // Single input wired; the second strings-to-array slot stays empty so the
  // node emits a one-element list.
  const list = g.stringsToArray('Classification list', [1740, 180], model);
  g.output('Classification', [2020, 180], list, 0, 'classifications');
  g.group('Classification', [20, 20, 2280, 560], '#405775');

  return g.build();
};

export const answerClassifierBlock: BundledTemplate = {
  slug: 'answer-classifier',
  kind: 'BLOCK',
  name: 'Answer classifier',
  description:
    'Classifies an assessment text into one of a fixed label set with the language model. Uses the deployment default model — no per-node setup.',
  category: 'Assessment',
  tags: ['classification', 'llm', 'labels'],
  content: build(),
  interfaces: {
    boundary: [
      {
        key: 'assessment',
        label: 'Assessment to classify',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 1,
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
        internalNodeId: 4,
        internalSlot: 0,
        required: true,
        description: `Label set instruction. Defaults to: ${DEFAULT_LABELS}.`,
      },
      {
        key: 'labels',
        label: 'Classification',
        dataType: '[string]',
        direction: 'output',
        internalNodeId: 8,
        internalSlot: 0,
        description: 'Single-element classification list.',
      },
    ],
  },
};
