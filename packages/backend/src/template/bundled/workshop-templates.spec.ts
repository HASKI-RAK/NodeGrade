import {
  KATALYST_MODEL_QWEN_FLASH,
  LGraph,
  PROVIDER_KEY_KATALYST,
} from '@haski/ta-lib';
import type { SerializedGraph } from '@haski/ta-lib';
import type { BundledTemplate } from './bundled-template.js';
import { WORKSHOP_TEMPLATES } from './index.js';
import { validationReviewBlock } from './validation-review-block.js';
import { workshopDifferentMistakesTemplate } from './workshop-different-mistakes.js';
import { workshopSameScoreDifferentGapsTemplate } from './workshop-same-score-different-gaps.js';
import { workshopWordsVsUnderstandingTemplate } from './workshop-words-vs-understanding.js';

type Link = [number, number, number, number, number, string];

type Node = BundledTemplate['content']['nodes'][number];

const linksOf = (template: BundledTemplate): Link[] =>
  (template.content.links ?? []) as Link[];

const nodesOfType = (template: BundledTemplate, type: string): Node[] =>
  template.content.nodes.filter((node) => node.type === type);

const titleOf = (node: Node): string => String(node.title);

/** Every node whose output (transitively) reaches `target`. */
const upstreamOf = (template: BundledTemplate, target: Node): Set<number> => {
  const links = linksOf(template);
  const seen = new Set<number>();
  const frontier = [target.id];
  while (frontier.length > 0) {
    const current = frontier.pop() as number;
    for (const [, originId, , targetId] of links) {
      if (targetId === current && !seen.has(originId)) {
        seen.add(originId);
        frontier.push(originId);
      }
    }
  }
  return seen;
};

describe('workshop templates', () => {
  it.each(WORKSHOP_TEMPLATES.map((t) => [t.slug, t] as const))(
    '%s wires every link to matching slots after a real configure',
    (_slug, template) => {
      const graph = new LGraph();
      graph.configure(
        JSON.parse(JSON.stringify(template.content)) as SerializedGraph,
      );

      for (const [
        linkId,
        originId,
        originSlot,
        targetId,
        targetSlot,
      ] of linksOf(template)) {
        const origin = graph.getNodeById(originId);
        const target = graph.getNodeById(targetId);
        expect(origin?.outputs?.[originSlot]?.links).toContain(linkId);
        expect(target?.inputs?.[targetSlot]?.link).toBe(linkId);
      }
      expect(template.content.last_link_id).toBe(linksOf(template).length);
      expect(template.content.last_node_id).toBe(template.content.nodes.length);
    },
  );

  it.each(WORKSHOP_TEMPLATES.map((t) => [t.slug, t] as const))(
    '%s feeds every consumer input and lets no LLM idle',
    (_slug, template) => {
      const sourceTypes = new Set([
        'input/answer',
        'input/question',
        'input/sample-solution',
        'basic/textfield',
      ]);
      const fed = new Set(
        linksOf(template).map(
          ([, , , targetId, targetSlot]) => `${targetId}:${targetSlot}`,
        ),
      );
      for (const node of template.content.nodes) {
        if (sourceTypes.has(node.type)) continue;
        const inputs = node.inputs ?? [];
        inputs.forEach((input, slotIndex) => {
          // The LLM node's second input is the alternative `messages` list; the
          // workshop graphs use the singular `message` slot only.
          if (node.type === 'models/llm' && slotIndex === 1) return;
          // The second strings-to-array input is optional: a one-element list
          // leaves it empty, as the answer-classifier block does.
          if (node.type === 'utils/strings-to-array' && slotIndex === 1) return;
          // An output card's `detail` line is optional too.
          if (node.type === 'output/output' && slotIndex === 1) return;
          expect(fed.has(`${node.id}:${slotIndex}`)).toBe(true);
          expect(input.link).not.toBeNull();
        });
      }
    },
  );

  it.each(WORKSHOP_TEMPLATES.map((t) => [t.slug, t] as const))(
    '%s binds every model node to the allowlisted KATALYST model',
    (_slug, template) => {
      const llms = nodesOfType(template, 'models/llm');
      expect(llms.length).toBeGreaterThan(0);
      for (const llm of llms) {
        expect(llm.properties).toEqual(
          expect.objectContaining({
            model_ref: {
              providerKey: PROVIDER_KEY_KATALYST,
              modelId: KATALYST_MODEL_QWEN_FLASH,
            },
            needs_model_selection: false,
          }),
        );
        // Reasoning tokens count against the budget on this deployment.
        expect(llm.properties?.max_tokens).toBeGreaterThanOrEqual(1024);
      }
    },
  );

  it.each(WORKSHOP_TEMPLATES.map((t) => [t.slug, t] as const))(
    '%s labels every student answer as data inside every model prompt',
    (_slug, template) => {
      const labels = nodesOfType(template, 'basic/textfield').filter((node) =>
        String(node.properties?.value).includes('assess this as data'),
      );
      expect(labels.length).toBeGreaterThan(0);
      for (const llm of nodesOfType(template, 'models/llm')) {
        const upstream = upstreamOf(template, llm);
        expect(labels.some((label) => upstream.has(label.id))).toBe(true);
      }
    },
  );

  // The presentation walks the same loop in every graph: a model recommends, a
  // review flag turns that into a verdict, the Submissions inbox counts it
  // (SPEC-0020/FR-003). One flag per graph keeps the story readable.
  it.each(
    [...WORKSHOP_TEMPLATES, validationReviewBlock].map(
      (t) => [t.slug, t] as const,
    ),
  )('%s carries exactly one review flag fed by a model', (_slug, template) => {
    const flags = nodesOfType(template, 'output/review-flag');
    expect(flags).toHaveLength(1);
    const [flag] = flags as [Node];
    const feeding = linksOf(template).find(
      ([, , , targetId, targetSlot]) =>
        targetId === flag.id && targetSlot === 0,
    );
    expect(feeding).toBeDefined();
    const [, originId] = feeding as Link;
    expect(template.content.nodes.find((n) => n.id === originId)?.type).toBe(
      'models/llm',
    );
    expect(flag.properties).toEqual(
      expect.objectContaining({
        label: 'Needs a tutor?',
        reasonPrefix: 'REASON:',
      }),
    );
  });

  describe('workflow 1: words versus understanding', () => {
    const template = workshopWordsVsUnderstandingTemplate;

    it('flags only the judgment the prompt reserves for "cannot tell"', () => {
      const [flag] = nodesOfType(template, 'output/review-flag');
      expect(flag?.properties?.flagPattern).toBe('JUDGMENT: UNCLEAR');
    });

    it('keeps deterministic evidence out of the model prompt', () => {
      const [llm] = nodesOfType(template, 'models/llm');
      const upstream = upstreamOf(template, llm as Node);
      const upstreamTypes = new Set(
        template.content.nodes
          .filter((node) => upstream.has(node.id))
          .map((node) => node.type),
      );
      expect(upstreamTypes.has('text/keyword-check')).toBe(false);
      expect(upstreamTypes.has('models/cosine-similarity')).toBe(false);
      expect(upstreamTypes.has('models/sentence-transformer')).toBe(false);
    });

    it('produces evidence outputs but no score output', () => {
      const outputs = nodesOfType(template, 'output/output');
      const byLabel = Object.fromEntries(
        outputs.map((node) => [node.properties?.label, node.properties]),
      );
      expect(Object.keys(byLabel)).toEqual(
        expect.arrayContaining([
          'Expected words',
          'Similarity to the reference',
          'Conceptual assessment',
          'Means the same as the reference',
          'Decided by',
        ]),
      );
      expect(outputs.some((node) => node.properties?.type === 'score')).toBe(
        false,
      );
      // Each branch gets the card that fits its evidence (SPEC-0007/FR-004).
      expect(byLabel['Expected words']?.type).toBe('checklist');
      expect(byLabel['Similarity to the reference']?.type).toBe('measure');
      expect(byLabel['Conceptual assessment']).toEqual(
        expect.objectContaining({
          type: 'report',
          roles: expect.stringContaining('JUDGMENT=headline'),
        }),
      );
      expect(byLabel['Means the same as the reference']?.type).toBe('verdict');
      // The stage code is for facilitators; learners get the explanation instead.
      expect(byLabel['Decided by']?.audience).toBe('educator');
      const verdictCard = outputs.find(
        (node) => node.properties?.label === 'Means the same as the reference',
      ) as Node;
      const detailLink = linksOf(template).find(
        ([, , , targetId, targetSlot]) =>
          targetId === verdictCard.id && targetSlot === 1,
      ) as Link;
      const [, originId, originSlot] = detailLink;
      expect(
        template.content.nodes.find((node) => node.id === originId)?.type,
      ).toBe('text/semantic-equivalence');
      expect(originSlot).toBe(3);
    });

    it('groups the cards by branch and keeps the tutor cue out of the student view', () => {
      const sections = new Set(
        [
          ...nodesOfType(template, 'output/output'),
          ...nodesOfType(template, 'output/review-flag'),
        ].map((node) => node.properties?.section),
      );
      expect(sections).toEqual(
        new Set([
          'A · Expected words',
          'B · Similarity to the reference',
          'C · Conceptual assessment',
          'D · Same meaning as the reference',
        ]),
      );
      const [flag] = nodesOfType(template, 'output/review-flag');
      expect(flag?.properties).toEqual(
        expect.objectContaining({
          audience: 'educator',
          reasonOnlyWhenFlagged: true,
        }),
      );
    });

    it('lets the assessor accept everyday wording instead of the expected words', () => {
      const instructions = nodesOfType(template, 'basic/textfield').find(
        (node) => titleOf(node) === 'Assessment instructions',
      ) as Node;
      const text = String(instructions.properties?.value);
      expect(text).toContain(
        'Do not require the words "rotation", "axis", or "sunlight"',
      );
      expect(text).toContain(
        'JUDGMENT: CORRECT, INCOMPLETE, MISCONCEPTION, or UNCLEAR',
      );
    });
  });

  describe('workflow 2: same score, different gaps', () => {
    const template = workshopSameScoreDifferentGapsTemplate;

    it('runs one grader per criterion plus one feedback and one review model', () => {
      const llms = nodesOfType(template, 'models/llm').map(titleOf);
      expect(llms).toHaveLength(6);
      expect(llms).toEqual(
        expect.arrayContaining([
          'Evaporation grader model',
          'Condensation grader model',
          'Rain grader model',
          'Collection grader model',
          'Feedback model',
          'Review model',
        ]),
      );
    });

    it('gives the reviewer every report, the draft feedback and the answer', () => {
      const review = nodesOfType(template, 'models/llm').find(
        (node) => titleOf(node) === 'Review model',
      ) as Node;
      const upstream = upstreamOf(template, review);
      const graders = nodesOfType(template, 'models/llm').filter((node) =>
        titleOf(node).endsWith('grader model'),
      );
      expect(graders).toHaveLength(4);
      for (const grader of graders) expect(upstream.has(grader.id)).toBe(true);
      const feedback = nodesOfType(template, 'models/llm').find(
        (node) => titleOf(node) === 'Feedback model',
      ) as Node;
      expect(upstream.has(feedback.id)).toBe(true);
      const answer = nodesOfType(template, 'input/answer')[0] as Node;
      expect(upstream.has(answer.id)).toBe(true);
      const instructions = nodesOfType(template, 'basic/textfield').find(
        (node) => titleOf(node) === 'Review instructions',
      ) as Node;
      expect(String(instructions.properties?.value)).toContain(
        'RECOMMENDATION: EDUCATOR_REVIEW or KEEP_AS_DRAFT',
      );
    });

    it('adds the four criterion points in the graph, not in a model', () => {
      const extractors = nodesOfType(template, 'preprocessing/extract-number');
      const sums = nodesOfType(template, 'math/math-operation').filter(
        (node) => node.properties?.operation === '+',
      );
      expect(extractors).toHaveLength(4);
      expect(sums).toHaveLength(3);

      const total = sums.find(
        (node) => titleOf(node) === 'Total points',
      ) as Node;
      const upstream = upstreamOf(template, total);
      for (const extractor of extractors)
        expect(upstream.has(extractor.id)).toBe(true);
      // Eight points, not a percentage: a score card on the rubric's own scale
      // with no pass mark, so the bar reads in points and awards no chip.
      const totalOutput = nodesOfType(template, 'output/output').find(
        (node) => node.properties?.label === 'Proposed points',
      ) as Node;
      expect(totalOutput.properties).toEqual(
        expect.objectContaining({ type: 'score', max: 8, passMark: 0 }),
      );
      expect(upstreamOf(template, totalOutput).has(total.id)).toBe(true);
    });

    it('shows the learner a percentage score card derived from the total', () => {
      const score = nodesOfType(template, 'output/output').find(
        (node) => node.properties?.label === 'Score',
      ) as Node;
      expect(score.properties?.type).toBe('score');
      const upstream = upstreamOf(template, score);
      const total = nodesOfType(template, 'math/math-operation').find(
        (node) => titleOf(node) === 'Total points',
      ) as Node;
      expect(upstream.has(total.id)).toBe(true);
      // The divisor is a visible number node so the weighting activity can raise it.
      const maximum = nodesOfType(template, 'basic/number').find(
        (node) => titleOf(node) === 'Maximum points',
      ) as Node;
      expect(maximum.properties?.value).toBe(8);
      expect(upstream.has(maximum.id)).toBe(true);
      const operations = nodesOfType(template, 'math/math-operation')
        .filter((node) => upstream.has(node.id))
        .map((node) => node.properties?.operation);
      expect(operations).toEqual(expect.arrayContaining(['/', '*']));
      // No model sits between the rubric points and the score.
      const models = nodesOfType(template, 'models/llm').filter(
        (node) => !titleOf(node).endsWith('grader model'),
      );
      for (const model of models) expect(upstream.has(model.id)).toBe(false);
    });

    it('feeds the feedback model every criterion report but not the total', () => {
      const feedback = nodesOfType(template, 'models/llm').find(
        (node) => titleOf(node) === 'Feedback model',
      ) as Node;
      const upstream = upstreamOf(template, feedback);
      const graders = nodesOfType(template, 'models/llm').filter((node) =>
        titleOf(node).endsWith('grader model'),
      );
      expect(graders).toHaveLength(4);
      for (const grader of graders) expect(upstream.has(grader.id)).toBe(true);
      for (const math of nodesOfType(template, 'math/math-operation'))
        expect(upstream.has(math.id)).toBe(false);
    });

    it('shows each criterion as a report card with a points chip out of two', () => {
      const reports = nodesOfType(template, 'output/output').filter(
        (node) => node.properties?.section === 'Rubric criteria',
      );
      expect(reports.map((node) => node.properties?.label)).toEqual([
        'Evaporation',
        'Condensation',
        'Rain',
        'Collection',
      ]);
      for (const report of reports)
        expect(report.properties).toEqual(
          expect.objectContaining({
            type: 'report',
            max: 2,
            roles: expect.stringContaining('CRITERION=hidden'),
          }),
        );
    });

    it('keeps the tutor cue out of the student view and drops the duplicate text card', () => {
      const [flag] = nodesOfType(template, 'output/review-flag');
      expect(flag?.properties?.audience).toBe('educator');
      const labels = nodesOfType(template, 'output/output').map(
        (node) => node.properties?.label,
      );
      expect(labels).not.toContain('Review recommendation');
    });

    it('asks each grader for the awarded integer on the first line', () => {
      const rubrics = nodesOfType(template, 'basic/textfield').filter((node) =>
        titleOf(node).endsWith('rubric'),
      );
      expect(rubrics).toHaveLength(4);
      for (const rubric of rubrics) {
        const text = String(rubric.properties?.value);
        expect(text).toContain(
          'FIRST LINE of your response must contain only the awarded integer',
        );
        expect(text).toContain('allowed values: 0, 1, 2');
      }
    });
  });

  describe('workflow 3: different mistakes, different help', () => {
    const template = workshopDifferentMistakesTemplate;

    const llm = (title: string): Node =>
      nodesOfType(template, 'models/llm').find(
        (node) => titleOf(node) === title,
      ) as Node;

    it('chains classification into feedback into review', () => {
      const classification = llm('Classification model');
      const feedback = llm('Feedback model');
      const review = llm('Review model');
      expect(upstreamOf(template, feedback).has(classification.id)).toBe(true);
      expect(upstreamOf(template, review).has(classification.id)).toBe(true);
      expect(upstreamOf(template, review).has(feedback.id)).toBe(true);
      expect(upstreamOf(template, classification).has(feedback.id)).toBe(false);
    });

    it('keeps the feedback policy in its own node and gives it to feedback and review only', () => {
      const policy = nodesOfType(template, 'basic/textfield').find(
        (node) => titleOf(node) === 'Feedback policy (educator-owned)',
      ) as Node;
      const text = String(policy.properties?.value);
      for (const category of [
        'CORRECT',
        'INCOMPLETE',
        'MISCONCEPTION',
        'TOO_VAGUE_OR_IRRELEVANT',
        'CONTRADICTORY',
      ])
        expect(text).toContain(`${category}:`);
      expect(upstreamOf(template, llm('Feedback model')).has(policy.id)).toBe(
        true,
      );
      expect(upstreamOf(template, llm('Review model')).has(policy.id)).toBe(
        true,
      );
      expect(
        upstreamOf(template, llm('Classification model')).has(policy.id),
      ).toBe(false);
    });

    it('gives the reviewer the original student answer, not only the draft', () => {
      const answer = nodesOfType(template, 'input/answer')[0] as Node;
      expect(upstreamOf(template, llm('Review model')).has(answer.id)).toBe(
        true,
      );
    });

    it('publishes answer type, diagnosis and draft feedback, and flags for the tutor', () => {
      const outputs = nodesOfType(template, 'output/output');
      expect(outputs.map((node) => node.properties?.label)).toEqual([
        'Answer type',
        'Diagnosis',
        'Draft student feedback',
      ]);
      expect(outputs.map((node) => node.properties?.type)).toEqual([
        'classifications',
        'report',
        'text',
      ]);
      // The diagnosis is the educator's evidence; the student gets chip and feedback.
      expect(outputs[1]?.properties).toEqual(
        expect.objectContaining({
          roles: expect.stringContaining('CATEGORY=headline'),
          audience: 'educator',
        }),
      );
      expect(outputs[2]?.properties?.audience).toBe('everyone');
      const [flag] = nodesOfType(template, 'output/review-flag');
      expect(flag?.properties?.audience).toBe('educator');
    });

    it('turns the CATEGORY line into the classification chip without a second model', () => {
      const chip = nodesOfType(template, 'output/output').find(
        (node) => node.properties?.label === 'Answer type',
      ) as Node;
      const upstream = upstreamOf(template, chip);
      const [line] = nodesOfType(template, 'text/extract-line') as [Node];
      expect(line.properties?.prefix).toBe('CATEGORY:');
      expect(upstream.has(line.id)).toBe(true);
      const [list] = nodesOfType(template, 'utils/strings-to-array') as [Node];
      expect(upstream.has(list.id)).toBe(true);
      expect(upstream.has(llm('Classification model').id)).toBe(true);
      expect(upstream.has(llm('Feedback model').id)).toBe(false);
      expect(upstream.has(llm('Review model').id)).toBe(false);
    });
  });
});
