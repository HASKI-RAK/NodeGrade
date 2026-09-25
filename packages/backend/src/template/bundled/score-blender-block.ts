import type { BundledTemplate } from './bundled-template.js';
import { GraphBuilder } from './graph-builder.js';

/**
 * Score blender block (SPEC-0003/FR-021 consistency check).
 *
 * The trap this block removes: combining two number sources needs a `basic/sum`
 * plus a `math/math-operation` division plus `math/precision` rounding, with the
 * divisor supplied as a wired number — beginners hunt the palette for an
 * "average" node that does not exist. Mirrors the extended lab's composite
 * score path (model score + semantic score, averaged).
 *
 * Fully deterministic: no language model, so no `model_ref` to configure and no
 * deployment default needed (SPEC-0016 does not apply).
 */

const build = () => {
  const g = new GraphBuilder();

  // Boundary inputs stay unwired: the editor's boundary adapter connects into
  // these input slots, so no internal link may occupy them.
  // Node ids in creation order: 1 score A port, 2 score B port, 3 divisor,
  // 4 sum, 5 average, 6 rounded, 7 output.
  const scoreAPort = g.sum('Score A (block input)', [40, 80]);
  const scoreBPort = g.sum('Score B (block input)', [40, 200]);
  const divisor = g.number('Average divisor', [40, 320], 2);

  const total = g.sum('Combine scores', [340, 140]);
  g.link(scoreAPort, 0, total, 0);
  g.link(scoreBPort, 0, total, 1);
  const average = g.math('Average score', [620, 140], '/', total, divisor);
  const rounded = g.precision('Rounded score', [900, 140], average, 1);
  g.output('Blended score', [1180, 140], rounded, 0, 'score');
  g.group('Score blending', [20, 20, 1420, 400], '#6f621f');

  return g.build();
};

export const scoreBlenderBlock: BundledTemplate = {
  slug: 'score-blender',
  kind: 'BLOCK',
  name: 'Score blender',
  description:
    'Averages two numeric scores (e.g. a model score and a similarity score) into one rounded blended score. Fully deterministic — no language model involved.',
  category: 'Validation',
  tags: ['score', 'average', 'blend', 'deterministic'],
  content: build(),
  interfaces: {
    boundary: [
      {
        key: 'score_a',
        label: 'First score',
        dataType: 'number',
        direction: 'input',
        internalNodeId: 4,
        internalSlot: 0,
        required: true,
        description: 'First numeric score to blend.',
      },
      {
        key: 'score_b',
        label: 'Second score',
        dataType: 'number',
        direction: 'input',
        internalNodeId: 4,
        internalSlot: 1,
        required: true,
        description: 'Second numeric score to blend.',
      },
      {
        key: 'blended',
        label: 'Blended score',
        dataType: 'number',
        direction: 'output',
        internalNodeId: 6,
        internalSlot: 0,
        description: 'Average of both scores, rounded to one decimal.',
      },
    ],
  },
};
