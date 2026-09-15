import type { BundledTemplate } from './bundled-template.js';

/**
 * The smallest complete workflow: a question, an answer input, and an output.
 *
 * Deliberately trivial. It exists so a fresh deployment has something in the gallery,
 * so the debug seed and the workshop smoke test have a template revision to bind to,
 * and so "use template" can be exercised end to end before any real workshop content
 * exists. The WAIE assessment content is SPEC-0007.
 */
export const demoWorkflowTemplate: BundledTemplate = {
  slug: 'demo-workflow',
  kind: 'WORKFLOW',
  name: 'Demo workflow',
  description:
    'A minimal starting point: a question, the student answer, and a feedback output.',
  category: 'Getting started',
  tags: ['demo', 'starter'],
  content: {
    last_node_id: 3,
    last_link_id: 1,
    nodes: [
      {
        id: 1,
        type: 'input/question',
        pos: [80, 100],
        size: [260, 100],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [],
        outputs: [{ name: 'string', type: 'string', links: [] }],
        title: 'Question',
        properties: { value: 'Explain the purpose of a strategy pattern.' },
      },
      {
        id: 2,
        type: 'input/answer',
        pos: [80, 280],
        size: [210, 60],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [],
        outputs: [{ name: 'string', type: 'string', links: [1] }],
        title: 'Answer Input',
        properties: { value: '' },
      },
      {
        id: 3,
        type: 'output/output',
        pos: [430, 280],
        size: [210, 80],
        flags: {},
        order: 2,
        mode: 0,
        inputs: [{ name: '*', type: '*', link: 1 }],
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
    links: [[1, 2, 0, 3, 0, 'string']],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  },
};
