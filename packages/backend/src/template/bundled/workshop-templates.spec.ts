import {
  KATALYST_MODEL_QWEN_FLASH,
  LGraph,
  PROVIDER_KEY_KATALYST,
} from '@haski/ta-lib';
import type { SerializedGraph } from '@haski/ta-lib';
import type { BundledTemplate } from './bundled-template.js';
import { WORKSHOP_TEMPLATES } from './index.js';
import { workshopClassificationDeadlockTemplate } from './workshop-classification-deadlock.js';
import { workshopEvidenceStrategyTemplate } from './workshop-evidence-strategy.js';
import { workshopRubricRaceConditionTemplate } from './workshop-rubric-race-condition.js';

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

      for (const [linkId, originId, originSlot, targetId, targetSlot] of linksOf(
        template,
      )) {
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
        linksOf(template).map(([, , , targetId, targetSlot]) => `${targetId}:${targetSlot}`),
      );
      for (const node of template.content.nodes) {
        if (sourceTypes.has(node.type)) continue;
        const inputs = node.inputs ?? [];
        inputs.forEach((input, slotIndex) => {
          // The LLM node's second input is the alternative `messages` list; the
          // workshop graphs use the singular `message` slot only.
          if (node.type === 'models/llm' && slotIndex === 1) return;
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

  describe('workflow 1: evidence comparison', () => {
    const template = workshopEvidenceStrategyTemplate;

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
      expect(outputs.map((node) => node.properties?.label)).toEqual(
        expect.arrayContaining([
          'Vocabulary found',
          'Vocabulary not found',
          'Reference similarity (not a grade)',
          'Conceptual diagnosis',
        ]),
      );
      expect(outputs.every((node) => node.properties?.type === 'text')).toBe(true);
    });
  });

  describe('workflow 2: rubric scoring', () => {
    const template = workshopRubricRaceConditionTemplate;

    it('runs one grader per criterion plus one feedback model', () => {
      const llms = nodesOfType(template, 'models/llm').map(titleOf);
      expect(llms).toHaveLength(5);
      expect(llms).toEqual(
        expect.arrayContaining([
          'Read-modify-write grader model',
          'Interleaving grader model',
          'Lost update grader model',
          'Mitigation grader model',
          'Feedback model',
        ]),
      );
    });

    it('adds the four criterion points in the graph, not in a model', () => {
      const extractors = nodesOfType(template, 'preprocessing/extract-number');
      const maths = nodesOfType(template, 'math/math-operation');
      expect(extractors).toHaveLength(4);
      expect(maths).toHaveLength(3);
      expect(maths.every((node) => node.properties?.operation === '+')).toBe(true);

      const total = maths.find((node) => titleOf(node) === 'Total points') as Node;
      const upstream = upstreamOf(template, total);
      for (const extractor of extractors) expect(upstream.has(extractor.id)).toBe(true);
      const scoreOutput = nodesOfType(template, 'output/output').find(
        (node) => node.properties?.type === 'score',
      );
      expect(scoreOutput?.properties?.label).toBe('Proposed rubric points / 100');
    });

    it('feeds the feedback model every criterion report but not the total', () => {
      const feedback = nodesOfType(template, 'models/llm').find(
        (node) => titleOf(node) === 'Feedback model',
      ) as Node;
      const upstream = upstreamOf(template, feedback);
      const graders = nodesOfType(template, 'models/llm').filter(
        (node) => node.id !== feedback.id,
      );
      for (const grader of graders) expect(upstream.has(grader.id)).toBe(true);
      for (const math of nodesOfType(template, 'math/math-operation'))
        expect(upstream.has(math.id)).toBe(false);
    });

    it('asks each grader for the awarded integer on the first line', () => {
      const rubrics = nodesOfType(template, 'basic/textfield').filter((node) =>
        titleOf(node).endsWith('rubric'),
      );
      expect(rubrics).toHaveLength(4);
      for (const rubric of rubrics) {
        expect(String(rubric.properties?.value)).toContain(
          'FIRST LINE of your response must contain only the awarded integer',
        );
      }
    });
  });

  describe('workflow 3: classification, policy feedback, review', () => {
    const template = workshopClassificationDeadlockTemplate;

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
      expect(String(policy.properties?.value)).toContain('CORRECT_MECHANISM:');
      expect(upstreamOf(template, llm('Feedback model')).has(policy.id)).toBe(true);
      expect(upstreamOf(template, llm('Review model')).has(policy.id)).toBe(true);
      expect(upstreamOf(template, llm('Classification model')).has(policy.id)).toBe(
        false,
      );
    });

    it('gives the reviewer the original student answer, not only the draft', () => {
      const answer = nodesOfType(template, 'input/answer')[0] as Node;
      expect(upstreamOf(template, llm('Review model')).has(answer.id)).toBe(true);
    });

    it('publishes diagnosis, draft feedback and review recommendation', () => {
      const labels = nodesOfType(template, 'output/output').map(
        (node) => node.properties?.label,
      );
      expect(labels).toEqual([
        'Answer diagnosis',
        'Draft feedback (not yet approved)',
        'Review recommendation',
      ]);
    });
  });
});
