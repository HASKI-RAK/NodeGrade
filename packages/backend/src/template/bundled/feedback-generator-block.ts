import type { BundledTemplate } from './bundled-template.js';

/**
 * A reusable "turn text into feedback" subgraph: text -> LLM -> output.
 *
 * The declared interface is what makes it insertable rather than just pasteable — the
 * editor can offer to wire an existing answer node into the prompt input (FR-020) and
 * the LLM's string output onward, instead of dropping three disconnected nodes.
 *
 * The block's `text` port lands straight on the model's `message` slot: since
 * SPEC-0019/FR-002 that slot takes a plain string, so the `prompt-message` node
 * that used to sit between them only to satisfy a wire type is gone.
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
    last_node_id: 2,
    last_link_id: 1,
    nodes: [
      {
        id: 1,
        type: 'models/llm',
        pos: [420, 100],
        size: [300, 200],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [
          { name: 'message', type: 'message,string,[message]', link: null },
          {
            name: 'messages',
            type: 'message,[message],[string],string',
            link: null,
          },
        ],
        outputs: [{ name: 'string', type: 'string', links: [1] }],
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
        id: 2,
        type: 'output/output',
        pos: [780, 100],
        size: [210, 80],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [{ name: '*', type: '*', link: 1 }],
        outputs: [],
        title: 'Feedback',
        properties: {
          uniqueId: '2',
          type: 'text',
          label: 'Feedback',
          value: '',
        },
      },
    ],
    links: [[1, 1, 0, 2, 0, 'string']],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  },
  interfaces: {
    boundary: [
      {
        key: 'text',
        label: 'Text to give feedback on',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 1,
        internalSlot: 0,
        required: true,
        description: 'Participant response or other text to evaluate.',
      },
      {
        key: 'feedback',
        label: 'Feedback text',
        dataType: 'string',
        direction: 'output',
        internalNodeId: 1,
        internalSlot: 0,
        description: 'Generated formative feedback.',
      },
    ],
  },
};
