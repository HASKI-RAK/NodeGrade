import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformLlmModelRefs } from './transform-llm-model-ref.js';

const legacyGraph = readFileSync(
  join(
    import.meta.dirname,
    '..',
    'graph',
    'graph-migration.test',
    'legacy_graph.json',
  ),
  'utf8',
);

const graphWith = (properties: Record<string, unknown>) =>
  JSON.stringify({
    last_node_id: 2,
    last_link_id: 0,
    nodes: [
      { id: 1, type: 'input/answer', properties: { value: 'kept' } },
      { id: 2, type: 'models/llm', properties },
    ],
    links: [],
    version: 0.4,
  });

const llmProps = (content: string) =>
  (
    JSON.parse(content) as {
      nodes: { type: string; properties: Record<string, unknown> }[];
    }
  ).nodes.find((n) => n.type === 'models/llm')!.properties;

describe('transformLlmModelRefs', () => {
  it('leaves an unselected model alone rather than demanding a selection', () => {
    const result = transformLlmModelRefs(graphWith({ model: '' }), {
      enabledProviderKeys: ['local', 'openai'],
    });

    expect(result.needingSelection).toBe(0);
    expect(llmProps(result.content)).toMatchObject({
      model_ref: null,
      needs_model_selection: false,
    });
  });

  it('uses available_model_sources when it names the provider', () => {
    const result = transformLlmModelRefs(
      graphWith({
        model: 'gpt-4',
        available_model_sources: { 'gpt-4': 'openai' },
      }),
      { enabledProviderKeys: ['local', 'openai'] },
    );

    expect(llmProps(result.content).model_ref).toEqual({
      providerKey: 'openai',
      modelId: 'gpt-4',
    });
  });

  it('resolves against the only enabled provider', () => {
    const result = transformLlmModelRefs(graphWith({ model: 'mistral' }), {
      enabledProviderKeys: ['local'],
    });

    expect(llmProps(result.content)).toMatchObject({
      model_ref: { providerKey: 'local', modelId: 'mistral' },
      needs_model_selection: false,
    });
  });

  it('refuses to guess between two providers', () => {
    const result = transformLlmModelRefs(graphWith({ model: 'mistral' }), {
      enabledProviderKeys: ['local', 'openrouter'],
    });

    expect(result.needingSelection).toBe(1);
    expect(llmProps(result.content)).toMatchObject({
      model_ref: null,
      needs_model_selection: true,
    });
  });

  it('uses the unique discovered composite model reference', () => {
    const result = transformLlmModelRefs(graphWith({ model: 'shared-id' }), {
      enabledProviderKeys: ['local', 'openrouter'],
      availableModels: [
        { providerKey: 'openrouter', modelId: 'shared-id' },
        { providerKey: 'local', modelId: 'different-id' },
      ],
    });

    expect(llmProps(result.content)).toMatchObject({
      model_ref: { providerKey: 'openrouter', modelId: 'shared-id' },
      needs_model_selection: false,
    });
  });

  it('requires selection when discovery finds no matching model', () => {
    const result = transformLlmModelRefs(graphWith({ model: 'missing-id' }), {
      enabledProviderKeys: ['local'],
      availableModels: [{ providerKey: 'local', modelId: 'different-id' }],
    });

    expect(llmProps(result.content)).toMatchObject({
      model_ref: null,
      needs_model_selection: true,
    });
  });

  it('requires selection when discovery finds the id on multiple providers', () => {
    const result = transformLlmModelRefs(graphWith({ model: 'shared-id' }), {
      enabledProviderKeys: ['local', 'openrouter'],
      availableModels: [
        { providerKey: 'local', modelId: 'shared-id' },
        { providerKey: 'openrouter', modelId: 'shared-id' },
      ],
    });

    expect(llmProps(result.content)).toMatchObject({
      model_ref: null,
      needs_model_selection: true,
    });
  });

  it('is idempotent', () => {
    const once = transformLlmModelRefs(graphWith({ model: 'mistral' }), {
      enabledProviderKeys: ['local'],
    });
    const twice = transformLlmModelRefs(once.content, {
      enabledProviderKeys: ['openai'],
    });

    expect(twice.changed).toBe(0);
    expect(llmProps(twice.content).model_ref).toEqual({
      providerKey: 'local',
      modelId: 'mistral',
    });
  });

  it('preserves every other node untouched', () => {
    const before = graphWith({ model: 'mistral' });
    const after = transformLlmModelRefs(before, {
      enabledProviderKeys: ['local'],
    }).content;

    const pick = (content: string) =>
      (JSON.parse(content) as { nodes: { type: string }[] }).nodes.filter(
        (n) => n.type !== 'models/llm',
      );

    expect(pick(after)).toEqual(pick(before));
  });

  describe('against the real legacy graph fixture', () => {
    it('converts its single LLM node without demanding a selection', () => {
      const result = transformLlmModelRefs(legacyGraph, {
        enabledProviderKeys: ['local', 'openai'],
      });

      // The fixture has model:"" and no available_model_sources at all, which is what
      // production content looks like. A strict FR-012 reading would strand it.
      expect(result.changed).toBe(1);
      expect(result.needingSelection).toBe(0);
    });

    it('changes nothing outside the LLM node', () => {
      const result = transformLlmModelRefs(legacyGraph, {
        enabledProviderKeys: ['local'],
      });

      const strip = (content: string) => {
        const graph = JSON.parse(content) as {
          nodes: { type: string }[];
        } & Record<string, unknown>;
        return {
          ...graph,
          nodes: graph.nodes.filter((n) => n.type !== 'models/llm'),
        };
      };

      expect(strip(result.content)).toEqual(strip(legacyGraph));
    });

    it('keeps the properties LLMNode.onConfigure still reads', () => {
      const result = transformLlmModelRefs(legacyGraph, {
        enabledProviderKeys: ['local'],
      });

      expect(llmProps(result.content)).toMatchObject({
        model: '',
        temperature: expect.anything(),
      });
    });
  });
});
