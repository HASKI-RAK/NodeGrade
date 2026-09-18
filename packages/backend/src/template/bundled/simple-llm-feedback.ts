import {
  KATALYST_MODEL_QWEN_FLASH,
  PROVIDER_KEY_KATALYST,
} from '@haski/ta-lib';
import type { BundledTemplate } from './bundled-template.js';

type SerializedInput = { name: string; type: string; link: number | null };
type SerializedOutput = { name: string; type: string; links: number[] };

const input = (
  name: string,
  type: string,
  link: number | null,
): SerializedInput => ({ name, type, link });

const output = (
  name: string,
  type: string,
  links: number[] = [],
): SerializedOutput => ({ name, type, links });

const node = ({
  id,
  type,
  pos,
  title,
  inputs = [],
  outputs = [],
  properties = {},
  widgetsValues,
  size = [220, 80],
}: {
  id: number;
  type: string;
  pos: [number, number];
  title: string;
  inputs?: SerializedInput[];
  outputs?: SerializedOutput[];
  properties?: Record<string, unknown>;
  widgetsValues?: unknown[];
  size?: [number, number];
}) => ({
  id,
  type,
  pos,
  size,
  flags: {},
  order: id - 1,
  mode: 0,
  inputs,
  outputs,
  title,
  properties,
  ...(widgetsValues ? { widgets_values: widgetsValues } : {}),
});

const concat = (
  id: number,
  pos: [number, number],
  title: string,
  links: [number | null, number | null],
  space = true,
) =>
  node({
    id,
    type: 'utils/concat-string',
    pos,
    title,
    inputs: [
      input('string', 'string', links[0]),
      input('string', 'string', links[1]),
    ],
    outputs: [output('string', 'string', [])],
    properties: { value: '', space },
    widgetsValues: [space],
    size: [200, 60],
  });

/**
 * Reconstruction of the "Simple LLM Feedback" strategy-pattern workshop graph.
 *
 * The source was a Task Editor screenshot, not exported JSON, so ids, positions and
 * links are a faithful approximation rather than a byte-exact copy. Three deliberate
 * migrations from what the screenshot shows:
 * - The LLM is bound to the allowlisted KATALYST model (ADR-0008); the screenshot's
 *   `zephyr-7b-beta` is not covered by the server-side model policy.
 * - `models/cosine-similarity` now takes embedding vectors, so the answer and the
 *   expert solution each pass through a `models/sentence-transformer` first (the same
 *   pattern as the extended assessment lab). The screenshot predates that change and
 *   wires strings directly into the similarity node.
 * - `to Number` / `toString` have no registered node types; both are `utils/route`
 *   passthroughs under their original titles so the similarity score keeps its full
 *   float precision into the feedback text.
 * - `Padding` is a `utils/concat-string` adding a trailing space; `Empty Space` is a
 *   `basic/textfield` holding a single space.
 *
 * German expert-solution texts are transcribed best-effort from the screenshot and the
 * system instruction is new (the screenshot does not show it). A facilitator should
 * proofread all copy before handing out a workshop on this template.
 */
export const simpleLlmFeedbackTemplate: BundledTemplate = {
  slug: 'simple-llm-feedback',
  kind: 'WORKFLOW',
  name: 'Simple LLM Feedback',
  description:
    'A compact strategy-pattern assessment: expert-solution context plus an LLM feedback pass, with a cosine-similarity score folded into the feedback text.',
  category: 'Workshop',
  tags: ['llm', 'feedback', 'similarity', 'strategy-pattern'],
  content: {
    last_node_id: 29,
    last_link_id: 31,
    nodes: [
      node({
        id: 1,
        type: 'input/answer',
        pos: [40, 60],
        title: 'Answer Input',
        outputs: [output('string', 'string', [1, 19])],
        properties: { value: '', minChars: 20, maxChars: 1500 },
        size: [210, 60],
      }),
      node({
        id: 2,
        type: 'basic/textfield',
        pos: [40, 150],
        title: 'Student answer label',
        outputs: [output('string', 'string', [2])],
        properties: { precision: 1, value: 'Student answer:' },
        size: [200, 60],
      }),
      {
        ...concat(3, [40, 240], 'concatenate', [2, 1]),
        outputs: [output('string', 'string', [3])],
      },
      {
        ...concat(4, [40, 330], 'Padding', [3, 4]),
        outputs: [output('string', 'string', [5])],
      },
      {
        ...concat(5, [40, 420], 'concatenate', [5, null]),
        outputs: [output('string', 'string', [6])],
      },
      node({
        id: 6,
        type: 'input/question',
        pos: [40, 520],
        title: 'Task',
        outputs: [output('string', 'string', [10])],
        properties: {
          value: 'Give feedback to the student based on the EXPERT SOLUTION:',
        },
        size: [280, 110],
      }),
      node({
        id: 7,
        type: 'basic/textfield',
        pos: [40, 660],
        title: 'Expert solution (strategy)',
        outputs: [output('string', 'string', [7])],
        properties: {
          precision: 1,
          value:
            'Das Strategiemuster ist für das Rechenprogramm nicht wirklich geeignet, weil es ein sehr simples Programm mit wenigen Codezeilen ist, ohne konkrete Strategien zu benötigen.',
        },
        size: [280, 170],
      }),
      node({
        id: 8,
        type: 'basic/textfield',
        pos: [40, 860],
        title: 'Expert solution (adapter)',
        outputs: [output('string', 'string', [8])],
        properties: {
          precision: 1,
          value:
            'Es ist weiterhin für das Datenkompressionsmodell ungeeignet, da jeder Parameter den das komplexe Modell benötigt, auch an das simple Modell gereicht wird, ohne Verwendung zu finden. Eine Implementierung würde in diesem Fall das Adapter Entwurfsmuster benötigen.',
        },
        size: [280, 170],
      }),
      {
        ...concat(9, [40, 1060], 'concatenate', [7, 8]),
        outputs: [output('string', 'string', [9, 21])],
      },
      {
        ...concat(10, [40, 1150], 'concatenate', [10, 9]),
        outputs: [output('string', 'string', [11])],
      },
      node({
        id: 11,
        type: 'basic/textfield',
        pos: [480, 80],
        title: 'Instruction',
        outputs: [output('string', 'string', [12])],
        properties: {
          precision: 1,
          value: [
            'You give feedback to a student based on the expert solution.',
            'Compare the student answer with the expert solution, using the',
            'similarity score as supporting evidence.',
            'Write at most five sentences: what is correct, what is missing,',
            'and one concrete next step. Address the student directly.',
          ].join('\n'),
        },
        size: [300, 150],
      }),
      node({
        id: 12,
        type: 'basic/prompt-message',
        pos: [480, 260],
        title: 'Prompt Message',
        inputs: [input('string', 'string', 12)],
        outputs: [output('message', 'message', [13])],
        properties: { value: { role: 'system', content: '' } },
        widgetsValues: ['system'],
        size: [300, 100],
      }),
      {
        ...concat(13, [480, 390], 'concatenate', [6, 11]),
        outputs: [output('string', 'string', [14])],
        size: [240, 80],
      },
      node({
        id: 14,
        type: 'basic/prompt-message',
        pos: [770, 390],
        title: 'Prompt Message',
        inputs: [input('string', 'string', 14)],
        outputs: [output('message', 'message', [15])],
        properties: { value: { role: 'user', content: '' } },
        widgetsValues: ['user'],
        size: [300, 100],
      }),
      node({
        id: 15,
        type: 'utils/concat-object',
        pos: [770, 260],
        title: 'Concat Object',
        inputs: [input('*', '*', 13), input('*', '*', 15)],
        outputs: [output('*', '*', [16])],
        properties: { value: [] },
        size: [220, 60],
      }),
      node({
        id: 16,
        type: 'models/llm',
        pos: [1040, 220],
        title: 'LLM',
        inputs: [input('message', 'message', null), input('messages', '*', 16)],
        outputs: [output('string', 'string', [17])],
        properties: {
          value: KATALYST_MODEL_QWEN_FLASH,
          model: KATALYST_MODEL_QWEN_FLASH,
          model_ref: {
            providerKey: PROVIDER_KEY_KATALYST,
            modelId: KATALYST_MODEL_QWEN_FLASH,
          },
          needs_model_selection: false,
          max_tokens: 512,
          temperature: 0.366,
          top_p: 0.709,
          top_k: 52,
          presence_penalty: 0,
        },
        widgetsValues: [512, 0.366, 0.709, 52, 0, KATALYST_MODEL_QWEN_FLASH],
        size: [320, 220],
      }),
      node({
        id: 17,
        type: 'basic/textfield',
        pos: [480, 660],
        title: 'Similarity title',
        outputs: [output('string', 'string', [18])],
        properties: {
          precision: 1,
          value: 'Student answer to solution similarity:',
        },
        size: [300, 110],
      }),
      node({
        id: 18,
        type: 'models/sentence-transformer',
        pos: [480, 810],
        title: 'Embed learner answer',
        inputs: [input('string', 'string', 19)],
        outputs: [output('[number]', '[number]', [20])],
        properties: { value: -1 },
        size: [240, 80],
      }),
      node({
        id: 19,
        type: 'models/sentence-transformer',
        pos: [770, 810],
        title: 'Embed expert solution',
        inputs: [input('string', 'string', 21)],
        outputs: [output('[number]', '[number]', [22])],
        properties: { value: -1 },
        size: [240, 80],
      }),
      node({
        id: 20,
        type: 'models/cosine-similarity',
        pos: [1060, 810],
        title: 'Cosine Similarity',
        inputs: [
          input('[number]', '[number]', 20),
          input('[number]', '[number]', 22),
        ],
        outputs: [output('number', 'number', [23])],
        properties: { value: -1 },
        size: [220, 80],
      }),
      node({
        id: 21,
        type: 'basic/number',
        pos: [1060, 920],
        title: 'Similarity scale',
        outputs: [output('number', 'number', [24])],
        properties: { value: 100 },
        widgetsValues: [100],
        size: [170, 60],
      }),
      node({
        id: 22,
        type: 'math/math-operation',
        pos: [1330, 910],
        title: 'Similarity percentage',
        inputs: [input('number', 'number', 25), input('number', 'number', 24)],
        outputs: [output('number', 'number', [26])],
        properties: { operation: '*', valueOne: 0, valueTwo: 100 },
        widgetsValues: ['*'],
        size: [200, 80],
      }),
      node({
        id: 23,
        type: 'utils/route',
        pos: [1330, 810],
        title: 'to Number',
        inputs: [input('*', '*', 23)],
        outputs: [output('*', '*', [25])],
        properties: { value: '' },
        size: [170, 60],
      }),
      node({
        id: 24,
        type: 'utils/route',
        pos: [1330, 1020],
        title: 'toString',
        inputs: [input('*', '*', 26)],
        outputs: [output('*', '*', [27])],
        properties: { value: '' },
        size: [170, 60],
      }),
      {
        ...concat(25, [1020, 1020], 'concatenate', [18, 27]),
        outputs: [output('string', 'string', [28])],
        size: [240, 80],
      },
      node({
        id: 26,
        type: 'basic/textfield',
        pos: [770, 1020],
        title: 'Empty Space',
        outputs: [output('string', 'string', [29])],
        properties: { precision: 1, value: ' ' },
        size: [180, 60],
      }),
      {
        ...concat(27, [770, 1130], 'concatenate', [28, 29]),
        outputs: [output('string', 'string', [30])],
        size: [240, 80],
      },
      {
        ...concat(28, [1620, 300], 'concatenate', [30, 17]),
        outputs: [output('string', 'string', [31])],
        size: [240, 80],
      },
      node({
        id: 29,
        type: 'output/output',
        pos: [1920, 300],
        title: 'feedback output',
        inputs: [input('*', '*', 31)],
        properties: {
          uniqueId: '29',
          type: 'text',
          label: 'Feedback',
          value: '',
        },
        widgetsValues: ['Feedback', 'text'],
        size: [220, 80],
      }),
    ],
    links: [
      [1, 1, 0, 3, 1, 'string'],
      [2, 2, 0, 3, 0, 'string'],
      [3, 3, 0, 4, 0, 'string'],
      [4, 1, 0, 4, 1, 'string'],
      [5, 4, 0, 5, 0, 'string'],
      [6, 5, 0, 13, 0, 'string'],
      [7, 7, 0, 9, 0, 'string'],
      [8, 8, 0, 9, 1, 'string'],
      [9, 9, 0, 10, 1, 'string'],
      [10, 6, 0, 10, 0, 'string'],
      [11, 10, 0, 13, 1, 'string'],
      [12, 11, 0, 12, 0, 'string'],
      [13, 12, 0, 15, 0, 'message'],
      [14, 13, 0, 14, 0, 'string'],
      [15, 14, 0, 15, 1, 'message'],
      [16, 15, 0, 16, 1, '*'],
      [17, 16, 0, 28, 1, 'string'],
      [18, 17, 0, 25, 0, 'string'],
      [19, 1, 0, 18, 0, 'string'],
      [20, 18, 0, 20, 0, '[number]'],
      [21, 9, 0, 19, 0, 'string'],
      [22, 19, 0, 20, 1, '[number]'],
      [23, 20, 0, 23, 0, 'number'],
      [24, 21, 0, 22, 1, 'number'],
      [25, 23, 0, 22, 0, '*'],
      [26, 22, 0, 24, 0, 'number'],
      [27, 24, 0, 25, 1, '*'],
      [28, 25, 0, 27, 0, 'string'],
      [29, 26, 0, 27, 1, 'string'],
      [30, 27, 0, 28, 0, 'string'],
      [31, 28, 0, 29, 0, 'string'],
    ],
    groups: [
      {
        title: 'Input',
        bounding: [10, 30, 400, 1230],
        color: '#50664a',
        font_size: 24,
      },
      {
        title: 'Language Model',
        bounding: [450, 30, 950, 560],
        color: '#405775',
        font_size: 24,
      },
      {
        title: 'Similarity',
        bounding: [450, 620, 1080, 620],
        color: '#6f621f',
        font_size: 24,
      },
      {
        title: 'Output',
        bounding: [1590, 250, 580, 220],
        color: '#4a4a5a',
        font_size: 24,
      },
    ],
    config: {},
    extra: {},
    version: 0.4,
  },
};
