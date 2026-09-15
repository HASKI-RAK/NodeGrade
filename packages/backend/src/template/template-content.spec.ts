import {
  TemplateContentError,
  graphNodeTypes,
  hashContent,
  parseGraphContent,
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
});
