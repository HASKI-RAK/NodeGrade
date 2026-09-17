import {
  getNodeDefinitions,
  KATALYST_MODEL_QWEN_FLASH,
  PROVIDER_KEY_KATALYST,
} from '@haski/ta-lib';
import { extendedAssessmentLabTemplate } from './extended-assessment-lab.js';

type Link = [number, number, number, number, number, string];

describe('extended assessment laboratory template', () => {
  const nodes = extendedAssessmentLabTemplate.content.nodes;
  const links = (extendedAssessmentLabTemplate.content.links ?? []) as Link[];

  it('exercises every registered node type', () => {
    const includedTypes = new Set(nodes.map((node) => node.type));
    const registeredTypes = getNodeDefinitions().map(
      (definition) => definition.type,
    );

    expect([...includedTypes].sort()).toEqual([...registeredTypes].sort());
  });

  it('connects every non-source node to the integration graph', () => {
    const linkedTargets = new Set(links.map(([, , , targetId]) => targetId));
    const sourceTypes = new Set([
      'basic/Image',
      'basic/document-loader',
      'basic/number',
      'basic/textfield',
      'input/answer',
      'input/question',
      'input/sample-solution',
    ]);

    const disconnected = nodes.filter(
      (candidate) =>
        !sourceTypes.has(candidate.type) && !linkedTargets.has(candidate.id),
    );
    expect(disconnected).toEqual([]);
  });

  it('binds its LLM to the allowlisted KATALYST model', () => {
    const llm = nodes.find((candidate) => candidate.type === 'models/llm');

    expect(llm?.properties).toEqual(
      expect.objectContaining({
        model_ref: {
          providerKey: PROVIDER_KEY_KATALYST,
          modelId: KATALYST_MODEL_QWEN_FLASH,
        },
        needs_model_selection: false,
      }),
    );
  });

  it('publishes feedback, score, and diagnostics', () => {
    const labels = nodes
      .filter((candidate) => candidate.type === 'output/output')
      .map((candidate) =>
        String(
          (candidate.properties as { label?: unknown } | undefined)?.label,
        ),
      );

    expect(labels).toEqual(
      expect.arrayContaining([
        'Model feedback',
        'Composite score',
        'Present | missing concepts',
        'Semantic similarity',
        'Word count + 5',
        'TF-IDF diagnostics',
      ]),
    );
  });
});
