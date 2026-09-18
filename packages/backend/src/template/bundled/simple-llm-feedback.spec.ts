import { resolveAnswerConstraints } from '@haski/ta-lib';
import { simpleLlmFeedbackTemplate } from './simple-llm-feedback.js';

type Link = [number, number, number, number, number, string];

const nodesOfType = (type: string) =>
  simpleLlmFeedbackTemplate.content.nodes.filter((node) => node.type === type);

const links = (simpleLlmFeedbackTemplate.content.links ?? []) as Link[];

const feeds = (originId: number, targetId: number): boolean =>
  links.some(
    ([, origin, , target]) => origin === originId && target === targetId,
  );

/**
 * The Simple LLM Feedback content: expert-solution context plus an LLM feedback pass,
 * with a cosine-similarity score folded into the feedback text.
 */
describe('simple LLM feedback template', () => {
  it('is a published workflow template', () => {
    expect(simpleLlmFeedbackTemplate.slug).toBe('simple-llm-feedback');
    expect(simpleLlmFeedbackTemplate.kind).toBe('WORKFLOW');
    expect(simpleLlmFeedbackTemplate.interfaces).toBeUndefined();
  });

  it('runs answer and expert solution through the LLM into feedback', () => {
    const [answer] = nodesOfType('input/answer');
    const [llm] = nodesOfType('models/llm');
    const [feedback] = nodesOfType('output/output');

    expect(answer).toBeDefined();
    expect(llm).toBeDefined();
    expect(feedback).toBeDefined();

    expect(feeds(answer!.id, 18)).toBe(true);
    expect(feeds(llm!.id, 28)).toBe(true);
    expect(feeds(28, feedback!.id)).toBe(true);
  });

  it('folds the similarity score into the feedback text', () => {
    const [similarity] = nodesOfType('models/cosine-similarity');
    const [scale] = nodesOfType('math/math-operation');

    expect(similarity).toBeDefined();
    expect(scale).toBeDefined();
    expect(feeds(similarity!.id, 23)).toBe(true);
    expect(feeds(scale!.id, 24)).toBe(true);
  });

  it('embeds both texts before comparing them', () => {
    const embeds = nodesOfType('models/sentence-transformer');
    const [similarity] = nodesOfType('models/cosine-similarity');

    expect(embeds).toHaveLength(2);
    for (const embed of embeds) {
      expect(feeds(embed.id, similarity!.id)).toBe(true);
    }
  });

  it('shows a single feedback output', () => {
    const outputs = nodesOfType('output/output');

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.properties).toEqual(
      expect.objectContaining({ type: 'text', label: 'Feedback' }),
    );
  });

  it('declares its answer length bounds on the answer node', () => {
    expect(
      resolveAnswerConstraints(simpleLlmFeedbackTemplate.content.nodes),
    ).toEqual({
      minChars: 20,
      maxChars: 1500,
    });
  });

  it('binds its LLM to the allowlisted KATALYST model', () => {
    const [llm] = nodesOfType('models/llm');
    const properties = llm?.properties as {
      model_ref: { providerKey: string; modelId: string };
      needs_model_selection: boolean;
    };

    expect(properties.model_ref).toEqual({
      providerKey: 'katalyst',
      modelId: 'qwen3.8-flash-next',
    });
    expect(properties.needs_model_selection).toBe(false);
  });
});
