import { LGraph, isBlockInterfaces } from '@haski/ta-lib';
import type { SerializedGraph } from '@haski/ta-lib';
import { parseGraphContent } from '../template-content.js';
import { BUNDLED_TEMPLATES } from './index.js';

/**
 * Bundled content is the one thing in this subsystem that no reviewer can check by
 * reading types: a template whose node types are not registered, or whose links point at
 * nothing, compiles perfectly and then loads as a broken canvas in front of a room.
 *
 * LGraph.configure() silently drops nodes it cannot construct, so comparing the node
 * count before and after is what actually proves the content is loadable.
 */
describe('bundled templates', () => {
  it('ships at least one workflow and one block', () => {
    const kinds = BUNDLED_TEMPLATES.map((template) => template.kind);
    expect(kinds).toContain('WORKFLOW');
    expect(kinds).toContain('BLOCK');
  });

  it('has unique slugs', () => {
    const slugs = BUNDLED_TEMPLATES.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('round-trips nested graph content and block provenance', () => {
    const serialized = {
      last_node_id: 1,
      last_link_id: 0,
      nodes: [
        {
          id: 1,
          type: 'graph/subgraph',
          pos: [100, 100],
          size: [320, 120],
          flags: {},
          order: 0,
          mode: 0,
          inputs: [{ name: 'Text', type: 'string', link: null }],
          outputs: [{ name: 'Feedback', type: 'string', links: null }],
          properties: {
            enabled: true,
            templateBlock: {
              templateId: 'feedback-generator',
              templateRevision: 1,
              templateName: 'Feedback generator',
              insertedAt: '2026-09-18T10:00:00.000Z',
            },
          },
          subgraph: {
            last_node_id: 1,
            last_link_id: 0,
            nodes: [
              {
                id: 1,
                type: 'basic/prompt-message',
                pos: [80, 100],
                size: [280, 100],
                flags: {},
                order: 0,
                mode: 0,
                properties: { value: { role: 'user', content: '' } },
              },
            ],
            links: [],
            groups: [],
            config: {},
            extra: {},
            version: 0.4,
          },
        },
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    const graph = new LGraph();
    graph.configure(serialized as SerializedGraph);

    const wrapper = graph.serialize().nodes[0] as unknown as {
      properties: { templateBlock: { templateRevision: number } };
      subgraph: { nodes: { type: string }[] };
    };
    expect(wrapper.properties.templateBlock.templateRevision).toBe(1);
    expect(wrapper.subgraph.nodes.map((node) => node.type)).toEqual([
      'basic/prompt-message',
    ]);
  });

  it.each(
    BUNDLED_TEMPLATES.map((template) => [template.slug, template] as const),
  )('%s loads into a real graph without losing nodes', (_slug, template) => {
    const serialized = JSON.stringify(template.content);
    const parsed = parseGraphContent(serialized);

    const graph = new LGraph();
    graph.configure(JSON.parse(serialized) as SerializedGraph);

    const loaded = graph.serialize() as { nodes?: { type: string }[] };

    expect(loaded.nodes).toHaveLength(parsed.nodes.length);
    expect(loaded.nodes?.map((node) => node.type).sort()).toEqual(
      parsed.nodes.map((node) => node.type).sort(),
    );
  });

  it.each(
    BUNDLED_TEMPLATES.map((template) => [template.slug, template] as const),
  )('%s has links that point at nodes it contains', (_slug, template) => {
    const nodeIds = new Set(template.content.nodes.map((node) => node.id));
    const links = (template.content.links ?? []) as unknown[][];

    for (const link of links) {
      const [, originId, , targetId] = link as [number, number, number, number];
      expect(nodeIds.has(originId)).toBe(true);
      expect(nodeIds.has(targetId)).toBe(true);
    }
  });

  it.each(
    BUNDLED_TEMPLATES.filter((template) => template.kind === 'BLOCK').map(
      (template) => [template.slug, template] as const,
    ),
  )(
    '%s declares interfaces that resolve to real nodes (FR-019)',
    (_slug, template) => {
      expect(isBlockInterfaces(template.interfaces)).toBe(true);

      const nodeIds = new Set(template.content.nodes.map((node) => node.id));
      const ports = template.interfaces?.boundary ?? [];

      expect(ports.length).toBeGreaterThan(0);
      for (const port of ports) {
        expect(nodeIds.has(port.internalNodeId)).toBe(true);
      }
    },
  );

  it('gives workflow templates no interfaces', () => {
    for (const template of BUNDLED_TEMPLATES) {
      if (template.kind === 'WORKFLOW') {
        expect(template.interfaces).toBeUndefined();
      }
    }
  });
});
