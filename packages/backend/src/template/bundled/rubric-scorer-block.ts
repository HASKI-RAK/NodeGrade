import type { BundledTemplate } from './bundled-template.js';
import { GraphBuilder } from './graph-builder.js';

/**
 * Rubric scorer block (SPEC-0003/FR-021).
 *
 * The WAIE assessment stage in miniature: question + answer join, a system prompt
 * carrying the rubric, a user prompt carrying the joined text, `concat-object`
 * into `models/llm` (singular `message` vs plural `messages` plumbing included),
 * and `extract-number` pulling the `Score: <n>` line out of free text. Beginners
 * rebuilding this by hand hit every one of those traps; here they only supply the
 * three strings and read the number.
 *
 * The LLM node carries no explicit `model_ref`: execution substitutes the
 * facilitator's deployment default at run time without persisting it (SPEC-0016).
 * Readiness passes the block while a usable default exists.
 */

const DEFAULT_RUBRIC = [
  'You grade short free-text answers for a teacher.',
  '',
  'Rubric (100 points):',
  '- Award points per criterion named below.',
  '- Deduct for missing or incorrect elements only.',
  '',
  'Grade the answer against the rubric. Justify the grade in two sentences and',
  'end your reply with a single line in the form: Score: <number between 0 and 100>',
].join('\n');

const build = () => {
  const g = new GraphBuilder();

  // Boundary inputs stay unwired: the editor's boundary adapter connects into
  // these input slots, so no internal link may occupy them. The scored strings
  // travel through the boundary ports at run time: the compiler rewires outer
  // links through the boundary onto the internal nodes below.
  // Node ids in creation order: 1 question port, 2 answer port, 3 rubric,
  // 4 answer prompt, 5 rubric system prompt, 6 concat-object, 7 LLM,
  // 8 extract-number, 9 output.
  const questionPort = g.concat('Question (block input)', [40, 80]);
  const answerPort = g.concat('Answer (block input)', [40, 220]);
  const rubric = g.textfield(
    'Rubric (editable)',
    [40, 360],
    DEFAULT_RUBRIC,
    [260, 200],
  );

  const rubricMessage = g.systemPrompt('Rubric prompt', [380, 420], rubric);
  const joined = g.concat('Question and answer', [700, 140]);
  g.link(questionPort, 0, joined, 0);
  g.link(answerPort, 0, joined, 1);
  const answerPrompt = g.promptMessage('Answer prompt', [1020, 140], joined);
  const messages = g.concatObject(
    'Assessment messages',
    [1340, 220],
    rubricMessage,
    answerPrompt,
  );
  const model = g.llmForMessages('Assessment model', [1660, 180], messages);
  const score = g.extractNumber('Score', [2040, 180], model);
  g.output('Score', [2320, 180], score, 0, 'score');
  g.group('Rubric scoring', [20, 20, 2580, 560], '#405775');

  return g.build();
};

export const rubricScorerBlock: BundledTemplate = {
  slug: 'rubric-scorer',
  kind: 'BLOCK',
  name: 'Rubric scorer',
  description:
    'Grades a learner answer against a rubric with the language model and returns the numeric score. Uses the deployment default model — no per-node setup.',
  category: 'Assessment',
  tags: ['rubric', 'scoring', 'llm', 'score'],
  content: build(),
  interfaces: {
    boundary: [
      {
        key: 'question',
        label: 'Question',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 1,
        internalSlot: 0,
        required: true,
        description: 'The task or question the learner answered.',
      },
      {
        key: 'answer',
        label: 'Learner answer',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 2,
        internalSlot: 0,
        required: true,
        description: 'The learner response to grade.',
      },
      {
        key: 'rubric',
        label: 'Rubric',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 5,
        internalSlot: 0,
        required: true,
        description:
          'Grading rubric ending in a "Score: <number>" instruction.',
      },
      {
        key: 'score',
        label: 'Score',
        dataType: 'number',
        direction: 'output',
        internalNodeId: 8,
        internalSlot: 0,
        description: 'Extracted numeric score.',
      },
    ],
  },
};
