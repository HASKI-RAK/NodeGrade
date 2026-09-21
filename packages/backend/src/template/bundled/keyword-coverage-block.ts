import type { BundledTemplate } from './bundled-template.js';
import { GraphBuilder } from './graph-builder.js';

/**
 * Keyword coverage block (SPEC-0003/FR-021 validation/review family).
 *
 * The traps this block removes: `text/keyword-check` expects keywords on input
 * slot 0 and the text under test on slot 1 (reversed wiring silently checks the
 * wrong direction), and raw answers carry punctuation and casing that defeat
 * literal matching. A `preprocessing/clean` preset (trim, double-space collapse,
 * enclosing punctuation) sits in front so participants get the Workshop 1
 * evidence branch without discovering the preset by trial and error.
 *
 * Fully deterministic: no language model, so no `model_ref` to configure and no
 * deployment default needed (SPEC-0016 does not apply).
 */

const build = () => {
  const g = new GraphBuilder();

  // Boundary inputs stay unwired: the editor's boundary adapter connects into
  // these input slots, so no internal link may occupy them.
  // Node ids in creation order: 1 keywords port, 2 text port, 3 clean,
  // 4 keyword check, 5 present output, 6 missing output.
  const keywordsPort = g.concat('Keywords (block input)', [40, 80]);
  const textPort = g.concat('Text (block input)', [40, 220]);

  const normalized = g.clean('Normalize text', [380, 220]);
  g.link(textPort, 0, normalized, 0);
  const check = g.keywordCheck('Keyword check', [700, 150]);
  g.link(keywordsPort, 0, check, 0);
  g.link(normalized, 0, check, 1);
  g.output('Expected words found', [1080, 110], check, 0);
  g.output('Expected words not found', [1080, 230], check, 1);
  g.group('Keyword coverage', [20, 20, 1400, 320], '#6f621f');

  return g.build();
};

export const keywordCoverageBlock: BundledTemplate = {
  slug: 'keyword-coverage',
  kind: 'BLOCK',
  name: 'Keyword coverage',
  description:
    'Checks which expected words appear in a text after normalizing punctuation and spacing. Fully deterministic — no language model involved.',
  category: 'Validation',
  tags: ['keywords', 'lexical', 'evidence', 'deterministic'],
  content: build(),
  interfaces: {
    boundary: [
      {
        key: 'keywords',
        label: 'Expected words',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 1,
        internalSlot: 0,
        required: true,
        description:
          'Comma-separated expected words, e.g. "rotation, axis, sunlight".',
      },
      {
        key: 'text',
        label: 'Text to check',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 2,
        internalSlot: 0,
        required: true,
        description: 'Learner response to search for the expected words.',
      },
      {
        key: 'present',
        label: 'Words found',
        dataType: 'string',
        direction: 'output',
        internalNodeId: 4,
        internalSlot: 0,
        description: 'Comma-separated keywords found in the text.',
      },
      {
        key: 'missing',
        label: 'Words not found',
        dataType: 'string',
        direction: 'output',
        internalNodeId: 4,
        internalSlot: 1,
        description: 'Comma-separated keywords missing from the text.',
      },
    ],
  },
};
