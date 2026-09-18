import {
  TemplateContentError,
  graphModelNodes,
  graphNodeTypes,
  hashContent,
  parseGraphContent,
  validateNestedGraph,
} from './template-content.js';

describe('hashContent', () => {
  it('is stable for identical content', () => {
    expect(hashContent('{"nodes":[]}')).toBe(hashContent('{"nodes":[]}'));
  });

  it('changes when a single byte changes', () => {
    expect(hashContent('{"nodes":[]}')).not.toBe(hashContent('{"nodes":[ ]}'));
  });
});

describe('parseGraphContent', () => {
  it('accepts a minimal graph', () => {
    expect(parseGraphContent('{"nodes":[]}')).toEqual({ nodes: [] });
  });

  it('keeps fields it does not know about', () => {
    const parsed = parseGraphContent(
      '{"nodes":[],"groups":[],"extra":{"a":1},"version":0.4}',
    );

    // LiteGraph owns this format; rejecting unknown keys would break the editor every
    // time it gains a field.
    expect(parsed.extra).toEqual({ a: 1 });
    expect(parsed.version).toBe(0.4);
  });

  it.each([
    ['not JSON', 'nope'],
    ['an array', '[]'],
    ['a bare string', '"hello"'],
    ['null', 'null'],
    ['no nodes array', '{"links":[]}'],
    ['a node that is not an object', '{"nodes":[42]}'],
    ['a node with no id', '{"nodes":[{"type":"input/answer"}]}'],
    ['a node with no type', '{"nodes":[{"id":1}]}'],
    ['a node with an empty type', '{"nodes":[{"id":1,"type":""}]}'],
  ])('rejects %s', (_label, content) => {
    expect(() => parseGraphContent(content)).toThrow(TemplateContentError);
  });
});

describe('graphNodeTypes', () => {
  it('reports each type once, sorted', () => {
    const content = parseGraphContent(
      '{"nodes":[{"id":1,"type":"output/output"},{"id":2,"type":"input/answer"},{"id":3,"type":"input/answer"}]}',
    );

    expect(graphNodeTypes(content)).toEqual(['input/answer', 'output/output']);
  });

  it('includes nested subgraph node types', () => {
    const content = parseGraphContent(
      JSON.stringify({
        nodes: [
          {
            id: 1,
            type: 'graph/subgraph',
            subgraph: { nodes: [{ id: 1, type: 'models/llm' }], links: [] },
          },
        ],
      }),
    );

    expect(graphNodeTypes(content)).toEqual(['graph/subgraph', 'models/llm']);
    expect(graphModelNodes(content)).toHaveLength(1);
  });
});

describe('validateNestedGraph', () => {
  const inner = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    type: 'basic/string',
    inputs: [],
    outputs: [{ name: 'value', type: 'string' }],
    ...overrides,
  });

  const wrapper = (subgraph: unknown, boundary: unknown = []) => ({
    id: 1,
    type: 'graph/subgraph',
    properties: { templateBoundary: boundary },
    subgraph,
  });

  it('accepts a well-formed nested graph', () => {
    const content = parseGraphContent(
      JSON.stringify({
        nodes: [
          wrapper({ nodes: [inner()], links: [] }, [
            {
              key: 'out',
              label: 'Out',
              dataType: 'string',
              direction: 'output',
              internalNodeId: 1,
              internalSlot: 0,
            },
          ]),
        ],
        links: [],
      }),
    );

    expect(
      validateNestedGraph(content, { registeredType: () => true }),
    ).toEqual([]);
  });

  it('reports the full block path for nested problems', () => {
    const content = parseGraphContent(
      JSON.stringify({
        nodes: [
          {
            ...wrapper({
              nodes: [{ id: 1, type: 'input/telepathy' }],
              links: [],
            }),
            title: 'Feedback Generator',
          },
        ],
        links: [],
      }),
    );

    const issues = validateNestedGraph(content, {
      registeredType: (type) => type !== 'input/telepathy',
    });
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'template / Feedback Generator',
        message: expect.stringContaining('input/telepathy'),
      }),
    ]);
  });

  it('rejects duplicate ids, bad links, bad boundaries, depth and size', () => {
    const duplicateIds = parseGraphContent(
      JSON.stringify({
        nodes: [
          { id: 1, type: 'basic/string' },
          { id: 1, type: 'basic/string' },
        ],
        links: [],
      }),
    );
    expect(
      validateNestedGraph(duplicateIds, { registeredType: () => true }),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Duplicate node id'),
      }),
    ]);

    const badLink = parseGraphContent(
      JSON.stringify({
        nodes: [{ id: 1, type: 'basic/string' }],
        links: [[1, 1, 0, 99, 0, 'string']],
      }),
    );
    expect(
      validateNestedGraph(badLink, { registeredType: () => true }),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('does not contain'),
      }),
    ]);

    const badBoundary = parseGraphContent(
      JSON.stringify({
        nodes: [
          wrapper({ nodes: [inner()], links: [] }, [
            {
              key: 'out',
              label: 'Out',
              dataType: 'string',
              direction: 'output',
              internalNodeId: 99,
              internalSlot: 0,
            },
          ]),
        ],
        links: [],
      }),
    );
    expect(
      validateNestedGraph(badBoundary, { registeredType: () => true }),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('does not contain'),
      }),
    ]);

    const duplicatedKey = parseGraphContent(
      JSON.stringify({
        nodes: [
          wrapper({ nodes: [inner()], links: [] }, [
            {
              key: 'out',
              label: 'Out',
              dataType: 'string',
              direction: 'output',
              internalNodeId: 1,
              internalSlot: 0,
            },
            {
              key: 'out',
              label: 'Out again',
              dataType: 'string',
              direction: 'output',
              internalNodeId: 1,
              internalSlot: 0,
            },
          ]),
        ],
        links: [],
      }),
    );
    expect(
      validateNestedGraph(duplicatedKey, { registeredType: () => true }),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('duplicated'),
      }),
    ]);

    const deep = parseGraphContent(
      JSON.stringify({
        nodes: [
          wrapper({ nodes: [wrapper({ nodes: [], links: [] })], links: [] }),
        ],
        links: [],
      }),
    );
    expect(
      validateNestedGraph(deep, { registeredType: () => true, maxDepth: 1 }),
    ).toEqual([
      expect.objectContaining({ message: expect.stringContaining('depth') }),
    ]);

    const cyclic: {
      nodes: { id: number; type: string; subgraph?: unknown }[];
    } = {
      nodes: [{ id: 1, type: 'graph/subgraph' }],
    };
    (cyclic.nodes[0] as { subgraph?: unknown }).subgraph = cyclic;
    expect(
      validateNestedGraph(cyclic as never, { registeredType: () => true }),
    ).toEqual([
      expect.objectContaining({ message: expect.stringContaining('cyclic') }),
    ]);

    const manyNodes = parseGraphContent(
      JSON.stringify({
        nodes: Array.from({ length: 4 }, (_, index) => ({
          id: index + 1,
          type: 'basic/string',
        })),
        links: [],
      }),
    );
    expect(
      validateNestedGraph(manyNodes, {
        registeredType: () => true,
        maxNodes: 3,
      }),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('node limit'),
      }),
    ]);
  });
});
