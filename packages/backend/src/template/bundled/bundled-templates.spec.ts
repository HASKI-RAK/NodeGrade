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
          title: 'Feedback Generator',
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
                title: 'Feedback prompt',
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
    graph.configure(serialized as unknown as SerializedGraph);

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

  /**
   * A link table and the slot lists on the nodes are two records of the same wire,
   * and litegraph trusts both: it draws the wire from the target's `link`, but moves
   * the data along the origin's `links`. Drop the id from one side and the canvas
   * shows a connection that silently carries nothing — invisible to a node count.
   */
  it.each(
    BUNDLED_TEMPLATES.map((template) => [template.slug, template] as const),
  )('%s agrees with its own nodes about every link', (_slug, template) => {
    type Link = [number, number, number, number, number, string];
    type Slot = { link?: number | null; links?: number[] | null };

    const links = (template.content.links ?? []) as Link[];
    const linkById = new Map(links.map((link) => [link[0], link]));
    const nodeById = new Map(template.content.nodes.map((n) => [n.id, n]));
    const problems: string[] = [];

    expect(new Set(links.map(([id]) => id)).size).toBe(links.length);

    for (const node of template.content.nodes) {
      ((node.inputs ?? []) as Slot[]).forEach((slot, index) => {
        if (slot.link === null || slot.link === undefined) return;
        const link = linkById.get(slot.link);
        if (!link || link[3] !== node.id || link[4] !== index)
          problems.push(
            `node ${node.id} input ${index} claims link ${slot.link}`,
          );
      });
      ((node.outputs ?? []) as Slot[]).forEach((slot, index) => {
        for (const id of slot.links ?? []) {
          const link = linkById.get(id);
          if (!link || link[1] !== node.id || link[2] !== index)
            problems.push(`node ${node.id} output ${index} claims link ${id}`);
        }
      });
    }

    for (const [id, origin, originSlot, target, targetSlot] of links) {
      const from = (nodeById.get(origin)?.outputs ?? [])[originSlot] as Slot;
      const to = (nodeById.get(target)?.inputs ?? [])[targetSlot] as Slot;
      if (!from || !(from.links ?? []).includes(id))
        problems.push(
          `link ${id} is missing from node ${origin} output ${originSlot}`,
        );
      if (!to || to.link !== id)
        problems.push(
          `link ${id} is missing from node ${target} input ${targetSlot}`,
        );
    }

    expect(problems).toEqual([]);
  });

  it.each(
    BUNDLED_TEMPLATES.filter((template) => template.kind === 'BLOCK').map(
      (template) => [template.slug, template] as const,
    ),
  )(
    '%s declares interfaces that resolve to real slots (FR-019)',
    (_slug, template) => {
      expect(isBlockInterfaces(template.interfaces)).toBe(true);

      const byId = new Map(
        template.content.nodes.map((node) => [node.id, node]),
      );
      const ports = template.interfaces?.boundary ?? [];

      expect(ports.length).toBeGreaterThan(0);
      const keys = new Set<string>();
      for (const port of ports) {
        expect(keys.has(port.key)).toBe(false);
        keys.add(port.key);
        const node = byId.get(port.internalNodeId);
        expect(node).toBeDefined();
        const slots = port.direction === 'input' ? node?.inputs : node?.outputs;
        expect(slots?.[port.internalSlot]).toBeDefined();
      }
    },
  );

  it.each(
    BUNDLED_TEMPLATES.filter(
      (template) =>
        template.kind === 'BLOCK' &&
        template.content.nodes.some((node) => node.type === 'models/llm'),
    ).map((template) => [template.slug, template] as const),
  )(
    '%s leaves its LLM nodes to the deployment default (SPEC-0016)',
    (_slug, template) => {
      for (const node of template.content.nodes) {
        if (node.type !== 'models/llm') continue;
        const properties = (node.properties ?? {}) as Record<string, unknown>;
        expect(properties.model_ref).toBeNull();
        expect(properties.needs_model_selection).toBe(true);
      }
    },
  );

  it('ships the canonical SPEC-0003/FR-021 block library', () => {
    const blocks = new Set(
      BUNDLED_TEMPLATES.filter((template) => template.kind === 'BLOCK').map(
        (template) => template.slug,
      ),
    );
    for (const slug of [
      'feedback-generator',
      'rubric-scorer',
      'answer-classifier',
      'similarity-scorer',
      'keyword-coverage',
      'score-blender',
      'validation-review',
    ])
      expect(blocks.has(slug)).toBe(true);
  });

  it('gives workflow templates no interfaces', () => {
    for (const template of BUNDLED_TEMPLATES) {
      if (template.kind === 'WORKFLOW') {
        expect(template.interfaces).toBeUndefined();
      }
    }
  });
});
