import type { BundledTemplate } from './bundled-template.js';

/**
 * A reusable "turn text into feedback" subgraph: prompt message -> LLM -> output.
 *
 * The declared interface is what makes it insertable rather than just pasteable — the
 * editor can offer to wire an existing answer node into the prompt input (FR-020) and
 * the LLM's string output onward, instead of dropping three disconnected nodes.
 *
 * SPEC-0003/FR-021 names five canonical blocks. This ships the mechanism plus the one
 * whose content is genuinely settled; the rubric scorer, answer classifier,
 * validation/review and consistency check are assessment design, and they arrive with
 * the WAIE content in SPEC-0007 rather than being guessed at here.
 */
export const feedbackGeneratorBlock: BundledTemplate = {
  slug: 'feedback-generator',
  kind: 'BLOCK',
  name: 'Feedback generator',
  description:
    'Sends text to the language model with a feedback prompt and shows the reply as feedback.',
  category: 'Feedback',
  tags: ['llm', 'feedback'],
  content: {
    last_node_id: 3,
    last_link_id: 2,
    nodes: [
      {
        id: 1,
        type: 'basic/prompt-message',
        pos: [80, 100],
        size: [280, 100],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [{ name: 'string', type: 'string', link: null }],
        outputs: [{ name: 'message', type: 'message', links: [1] }],
        title: 'Feedback prompt',
        properties: {
          value: {
            role: 'user',
            content: '',
          },
        },
        widgets_values: ['user'],
      },
      {
        id: 2,
        type: 'models/llm',
        pos: [420, 100],
        size: [300, 200],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [
          { name: 'message', type: 'message', link: 1 },
          { name: 'messages', type: '*', link: null },
        ],
        outputs: [{ name: 'string', type: 'string', links: [2] }],
        title: 'Feedback model',
        properties: {
          model: '',
          model_ref: null,
          needs_model_selection: true,
          max_tokens: 64,
          temperature: 0.4,
          top_p: 1,
          top_k: 50,
          presence_penalty: 0,
        },
      },
      {
        id: 3,
        type: 'output/output',
        pos: [780, 100],
        size: [210, 80],
        flags: {},
        order: 2,
        mode: 0,
        inputs: [{ name: '*', type: '*', link: 2 }],
        outputs: [],
        title: 'Feedback',
        properties: {
          uniqueId: '3',
          type: 'text',
          label: 'Feedback',
          value: '',
        },
      },
    ],
    links: [
      [1, 1, 0, 2, 0, 'message'],
      [2, 2, 0, 3, 0, 'string'],
    ],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  },
  interfaces: {
    inputs: [
      { nodeId: 1, slot: 0, name: 'Text to give feedback on', type: 'string' },
    ],
    outputs: [{ nodeId: 2, slot: 0, name: 'Feedback text', type: 'string' }],
  },
};
