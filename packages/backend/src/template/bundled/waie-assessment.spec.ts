import { resolveAnswerConstraints } from '@haski/ta-lib';
import { BUNDLED_TEMPLATES } from './index.js';
import { waieAssessmentTemplate } from './waie-assessment.js';

type Link = [number, number, number, number, number, string];

const nodesOfType = (type: string) =>
  waieAssessmentTemplate.content.nodes.filter((node) => node.type === type);

const links = (waieAssessmentTemplate.content.links ?? []) as Link[];

const feeds = (originId: number, targetId: number): boolean =>
  links.some(
    ([, origin, , target]) => origin === originId && target === targetId,
  );

/**
 * The canonical WAIE content (SPEC-0007/FR-001, AC-001). The shape is the product
 * promise, not an implementation detail: the workshop assignment is "change the rubric,
 * change the feedback, add a validation step", which only works while the four stages
 * remain separately addressable nodes.
 */
describe('WAIE assessment template', () => {
  it('is the only canonical WAIE workflow shipped', () => {
    const canonical = BUNDLED_TEMPLATES.filter((template) =>
      template.tags.includes('waie'),
    );

    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.slug).toBe('waie-assessment');
    expect(canonical[0]?.kind).toBe('WORKFLOW');
  });

  it('runs input through assessment, classification and feedback', () => {
    const [question] = nodesOfType('input/question');
    const [answer] = nodesOfType('input/answer');
    const [assessment, classification, feedback] = nodesOfType('models/llm');
    const [score] = nodesOfType('preprocessing/extract-number');

    expect(question).toBeDefined();
    expect(answer).toBeDefined();
    expect(score).toBeDefined();

    // Input reaches the assessment stage, and its reply drives the other two stages.
    expect(feeds(question!.id, 4)).toBe(true);
    expect(feeds(answer!.id, 4)).toBe(true);
    expect(feeds(assessment!.id, score!.id)).toBe(true);
    expect(
      links.some(([, origin]) => origin === assessment!.id) &&
        [classification!.id, feedback!.id].every((id) =>
          links.some(([, , , target]) => target === id),
        ),
    ).toBe(true);
  });

  it('shows a score, a classification and feedback', () => {
    const outputs = nodesOfType('output/output').map(
      (node) => (node.properties as { type: string; label: string }).type,
    );

    expect(outputs).toEqual(
      expect.arrayContaining(['score', 'classifications', 'text']),
    );
  });

  it('declares its answer length bounds on the answer node (FR-007, FR-008a)', () => {
    expect(
      resolveAnswerConstraints(waieAssessmentTemplate.content.nodes),
    ).toEqual({
      minChars: 20,
      maxChars: 1500,
    });
  });

  it('ships every model configured for the OpenRouter free-model router', () => {
    for (const node of nodesOfType('models/llm')) {
      const properties = node.properties as {
        model_ref: { providerKey: string; modelId: string };
        needs_model_selection: boolean;
      };
      expect(properties.model_ref).toEqual({
        providerKey: 'openrouter',
        modelId: 'openrouter/free',
      });
      expect(properties.needs_model_selection).toBe(false);
    }
  });
});
