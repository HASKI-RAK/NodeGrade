import { getNodeDefinition } from '@haski/ta-lib';
import type { GraphContent, GraphNode } from '../template/template-content.js';

/**
 * Pure compilation of an encapsulated editor graph into a flat execution graph
 * (plan Gate 5).
 *
 * LiteGraph 0.7.18 runs a native Subgraph through synchronous subgraph.runStep(),
 * while NodeGrade awaits asynchronous node execution including LLM requests. The
 * persisted workflow stays encapsulated; this module produces an ephemeral flat graph
 * that the existing awaited topological runner executes.
 *
 * Boundary adapters (graph/input, graph/output) dissolve: outer links targeting a
 * wrapper port reconnect to the referenced inner node, and inner links through an
 * adapter reconnect across the boundary. The boundary metadata the editor copies onto
 * each wrapper (properties.templateBoundary) is the source of truth for that mapping.
 */

export type ExecutionSourceEntry = {
  /** Sequential id in the compiled flat graph. */
  executionId: number;
  /** Editor id of the innermost wrapper, or null for top-level nodes. */
  wrapperId: number | null;
  /** Wrapper path from the outermost block, e.g. ["Feedback Generator"]. */
  wrapperPath: string[];
  /** Editor id of the inner node, or the top-level node id. */
  sourceId: number;
  /** Human label for grouped traces, e.g. "Feedback Generator / Feedback model". */
  traceLabel: string;
  /** Node type in the compiled graph. */
  type: string;
};

export type CompiledExecutionGraph = {
  content: GraphContent;
  sourceMap: ExecutionSourceEntry[];
};

export class SubgraphCompileError extends Error {
  constructor(
    message: string,
    readonly wrapperPath: string[],
    readonly innerId?: number,
  ) {
    super(message);
    this.name = 'SubgraphCompileError';
  }
}

type BoundaryPort = {
  key: string;
  label?: string;
  direction: 'input' | 'output';
  internalNodeId: number;
  internalSlot: number;
  required?: boolean;
};

type SerializedLink = [number, number, number, number, number, string];

const SUBGRAPH_TYPE = 'graph/subgraph';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asGraph = (value: unknown): GraphContent | null =>
  isRecord(value) && Array.isArray(value.nodes)
    ? (value as GraphContent)
    : null;

const nodeTitle = (node: GraphNode, fallback: string): string => {
  const title = (node as { title?: unknown }).title;
  if (typeof title === 'string' && title.length > 0) return title;
  // Untitled nodes must trace by name, not number: the type short name
  // ("watch" for basic/watch) matches the palette and TraceView tests.
  const definition = getNodeDefinition(node.type);
  if (definition) return definition.title;
  const short = node.type.split('/').pop();
  return short && short.length > 0 ? short : fallback;
};

const boundaryOf = (node: GraphNode): BoundaryPort[] => {
  const properties = node.properties;
  if (!isRecord(properties)) return [];
  const boundary = properties.templateBoundary;
  if (!Array.isArray(boundary)) return [];
  return boundary.filter(
    (entry): entry is BoundaryPort =>
      isRecord(entry) &&
      typeof entry.key === 'string' &&
      (entry.direction === 'input' || entry.direction === 'output') &&
      typeof entry.internalNodeId === 'number' &&
      typeof entry.internalSlot === 'number',
  );
};

const scopeLabel = (path: string[]): string =>
  path.length > 0 ? path.join(' / ') : 'Workflow';

/**
 * Flattens every graph/subgraph wrapper into namespaced execution nodes and links,
 * preserving topology and producing a stable source map.
 */
export function compileEditorGraphForExecution(
  content: GraphContent,
  options: {
    registeredType?: (type: string) => boolean;
    maxNodes?: number;
  } = {},
): CompiledExecutionGraph {
  const registeredType =
    options.registeredType ?? ((type) => getNodeDefinition(type) !== undefined);
  const maxNodes = options.maxNodes ?? 2000;

  const nodes: GraphNode[] = [];
  const links: SerializedLink[] = [];
  const sourceMap: ExecutionSourceEntry[] = [];
  let nextId = 0;
  let nextLinkId = 0;

  // Maps a scope-local (graph, nodeId) pair to its flat execution id. Wrapper port
  // slots resolve through boundaryOf() rather than this map.
  const emitted = new Map<GraphContent, Map<number, number>>();

  const emitNode = (
    node: GraphNode,
    scope: GraphContent,
    path: string[],
    wrapperId: number | null,
  ): number => {
    if (!registeredType(node.type)) {
      throw new SubgraphCompileError(
        `${scopeLabel(path)}: node type "${node.type}" is not registered.`,
        path,
        node.id,
      );
    }
    nextId += 1;
    if (nodes.length + 1 > maxNodes) {
      throw new SubgraphCompileError(
        `${scopeLabel(path)}: compiled graph exceeds the execution limit of ${maxNodes} nodes.`,
        path,
      );
    }
    const executionId = nextId;
    const clone = structuredClone(node);
    clone.id = executionId;
    // The compiled graph is flat: nested subgraph payloads must not leak through.
    delete clone.subgraph;
    nodes.push(clone);
    let scopeIds = emitted.get(scope);
    if (!scopeIds) {
      scopeIds = new Map<number, number>();
      emitted.set(scope, scopeIds);
    }
    scopeIds.set(node.id, executionId);
    const title = nodeTitle(node, `node ${node.id}`);
    sourceMap.push({
      executionId,
      wrapperId,
      wrapperPath: [...path],
      sourceId: node.id,
      traceLabel: path.length > 0 ? `${path.join(' / ')} / ${title}` : title,
      type: node.type,
    });
    return executionId;
  };

  const emitScopeNodes = (
    scope: GraphContent,
    path: string[],
    wrapperId: number | null,
  ): void => {
    for (const node of scope.nodes) {
      if (node.type === SUBGRAPH_TYPE) {
        const nested = asGraph(node.subgraph);
        if (!nested) {
          throw new SubgraphCompileError(
            `${scopeLabel(path)}: block "${nodeTitle(node, `node ${node.id}`)}" has no nested graph content.`,
            path,
            node.id,
          );
        }
        // Inner nodes carry the innermost wrapper id so traces group correctly.
        emitScopeNodes(
          nested,
          [...path, nodeTitle(node, `node ${node.id}`)],
          node.id,
        );
        continue;
      }
      // Boundary adapters dissolve; connections resolve through boundary metadata.
      if (node.type === 'graph/input' || node.type === 'graph/output') continue;
      emitNode(node, scope, path, wrapperId);
    }
  };

  /** Flat execution id for a plain node in the given scope, if it was emitted. */
  const executionOf = (scope: GraphContent, nodeId: number): number | null =>
    emitted.get(scope)?.get(nodeId) ?? null;

  /**
   * Resolves a wrapper port slot to the flat execution endpoint behind it, using the
   * wrapper's boundary metadata. Wrapper port order follows boundary order filtered
   * by direction, matching the editor adapter.
   */
  const resolveWrapperPort = (
    wrapper: GraphNode,
    scope: GraphContent,
    slot: number,
    side: 'input' | 'output',
  ): { executionId: number; slot: number } => {
    const path = wrapperPathOf(wrapper);
    const ordered = boundaryOf(wrapper).filter(
      (port) => port.direction === side,
    );
    const port = ordered[slot];
    if (!port) {
      throw new SubgraphCompileError(
        `${scopeLabel(path)}: block "${nodeTitle(wrapper, `node ${wrapper.id}`)}" has no ${side} port ${slot}.`,
        path,
        wrapper.id,
      );
    }
    const nested = asGraph(wrapper.subgraph);
    if (!nested) {
      throw new SubgraphCompileError(
        `${scopeLabel(path)}: block "${nodeTitle(wrapper, `node ${wrapper.id}`)}" has no nested graph content.`,
        path,
        wrapper.id,
      );
    }
    const executionId = executionOf(nested, port.internalNodeId);
    if (executionId === null) {
      throw new SubgraphCompileError(
        `${[...path, nodeTitle(wrapper, `node ${wrapper.id}`)].join(' / ')}: boundary key ${port.key} references node ${port.internalNodeId}, which the nested graph does not contain.`,
        [...path, nodeTitle(wrapper, `node ${wrapper.id}`)],
        port.internalNodeId,
      );
    }
    void scope;
    return { executionId, slot: port.internalSlot };
  };

  // Wrapper lookup by editor id, plus each wrapper's parent scope and path.
  const wrappers = new Map<
    number,
    { node: GraphNode; scope: GraphContent; path: string[] }
  >();
  const wrapperPathOf = (wrapper: GraphNode): string[] =>
    wrappers.get(wrapper.id)?.path ?? [];

  const indexWrappers = (scope: GraphContent, path: string[]): void => {
    for (const node of scope.nodes) {
      if (node.type !== SUBGRAPH_TYPE) continue;
      wrappers.set(node.id, { node, scope, path });
      const nested = asGraph(node.subgraph);
      if (nested)
        indexWrappers(nested, [...path, nodeTitle(node, `node ${node.id}`)]);
    }
  };

  const byIdIn = (scope: GraphContent): Map<number, GraphNode> =>
    new Map(scope.nodes.map((node) => [node.id, node]));

  /**
   * Resolves one link endpoint to a flat execution endpoint. Endpoints on a wrapper
   * port cross the boundary; endpoints on plain nodes map directly. Adapter nodes
   * never appear in the flat graph, so an endpoint on one is a malformed graph.
   */
  const resolveEndpoint = (
    scope: GraphContent,
    path: string[],
    nodeId: number,
    slot: number,
    side: 'origin' | 'target',
  ): { executionId: number; slot: number } => {
    const node = byIdIn(scope).get(nodeId);
    if (!node) {
      throw new SubgraphCompileError(
        `${scopeLabel(path)}: link references node ${nodeId}, which this graph scope does not contain.`,
        path,
        nodeId,
      );
    }
    if (node.type === SUBGRAPH_TYPE) {
      return resolveWrapperPort(
        node,
        scope,
        slot,
        side === 'target' ? 'input' : 'output',
      );
    }
    if (node.type === 'graph/input' || node.type === 'graph/output') {
      throw new SubgraphCompileError(
        `${scopeLabel(path)}: link terminates at boundary adapter node ${nodeId}; connect through the block boundary instead.`,
        path,
        nodeId,
      );
    }
    const executionId = executionOf(scope, nodeId);
    if (executionId === null) {
      throw new SubgraphCompileError(
        `${scopeLabel(path)}: link references node ${nodeId}, which the compiled graph does not contain.`,
        path,
        nodeId,
      );
    }
    return { executionId, slot };
  };

  const emitScopeLinks = (scope: GraphContent, path: string[]): void => {
    // Inner links that terminate at a boundary adapter dissolve: the adapter is
    // not an execution node, and the cross-boundary connection is expressed by
    // the outer link through the wrapper port. Skipping them here keeps the flat
    // graph free of adapter endpoints while preserving topology.
    const adapterIds = new Set(
      scope.nodes
        .filter(
          (node) => node.type === 'graph/input' || node.type === 'graph/output',
        )
        .map((node) => node.id),
    );
    for (const link of scope.links ?? []) {
      if (!Array.isArray(link)) continue;
      const [, originId, originSlot, targetId, targetSlot, linkType] = link as [
        unknown,
        number,
        number,
        number,
        number,
        string,
      ];
      if (adapterIds.has(originId) || adapterIds.has(targetId)) continue;
      const origin = resolveEndpoint(
        scope,
        path,
        originId,
        originSlot,
        'origin',
      );
      const target = resolveEndpoint(
        scope,
        path,
        targetId,
        targetSlot,
        'target',
      );
      nextLinkId += 1;
      links.push([
        nextLinkId,
        origin.executionId,
        origin.slot,
        target.executionId,
        target.slot,
        typeof linkType === 'string' ? linkType : '*',
      ]);
    }
    for (const node of scope.nodes) {
      if (node.type !== SUBGRAPH_TYPE) continue;
      const nested = asGraph(node.subgraph);
      if (nested)
        emitScopeLinks(nested, [...path, nodeTitle(node, `node ${node.id}`)]);
    }
  };

  // Missing required boundary inputs fail before execution with the wrapper path
  // and inner node identity, e.g. "Feedback Generator / Feedback prompt: missing
  // required input Text to give feedback on".
  const checkRequiredInputs = (scope: GraphContent, path: string[]): void => {
    const connectedInputs = new Map<number, Set<number>>();
    const markConnected = (nodeId: number, slot: number): void => {
      const slots = connectedInputs.get(nodeId) ?? new Set<number>();
      slots.add(slot);
      connectedInputs.set(nodeId, slots);
    };
    for (const link of scope.links ?? []) {
      if (!Array.isArray(link)) continue;
      const [, , , targetId, targetSlot] = link as [
        unknown,
        number,
        number,
        number,
        number,
      ];
      const target = byIdIn(scope).get(targetId);
      if (!target) continue;
      if (target.type === SUBGRAPH_TYPE) {
        const port = boundaryOf(target).filter(
          (entry) => entry.direction === 'input',
        )[targetSlot];
        if (port) markConnected(port.internalNodeId, port.internalSlot);
        continue;
      }
      markConnected(targetId, targetSlot);
    }
    for (const node of scope.nodes) {
      if (node.type !== SUBGRAPH_TYPE) continue;
      const nested = asGraph(node.subgraph);
      if (!nested) continue;
      const blockPath = [...path, nodeTitle(node, `node ${node.id}`)];
      const requiredInputs = boundaryOf(node).filter(
        (port) => port.direction === 'input' && port.required === true,
      );
      for (const port of requiredInputs) {
        const innerConnected = connectedInputs.get(port.internalNodeId);
        const innerLinks = nested.links ?? [];
        const innerNodesById = byIdIn(nested);
        const hasInnerSource = innerLinks.some((link) => {
          if (!Array.isArray(link)) return false;
          const [, originId, , targetId, targetSlot] = link as [
            unknown,
            number,
            number,
            number,
            number,
          ];
          if (
            targetId !== port.internalNodeId ||
            targetSlot !== port.internalSlot
          )
            return false;
          // Adapter links always terminate at the inner slot by construction
          // (graph/input connects adapter output 0 into the inner input). Only a
          // non-adapter origin counts as a real inner source.
          const origin = innerNodesById.get(originId);
          return !!origin && origin.type !== 'graph/input';
        });
        if (!innerConnected?.has(port.internalSlot) && !hasInnerSource) {
          const inner = byIdIn(nested).get(port.internalNodeId);
          const innerTitle = inner
            ? nodeTitle(inner, `node ${inner.id}`)
            : `node ${port.internalNodeId}`;
          throw new SubgraphCompileError(
            `${blockPath.join(' / ')} / ${innerTitle}: missing required input ${port.label ?? port.key}.`,
            blockPath,
            port.internalNodeId,
          );
        }
      }
      checkRequiredInputs(nested, blockPath);
    }
  };

  indexWrappers(content, []);
  checkRequiredInputs(content, []);
  emitScopeNodes(content, [], null);
  emitScopeLinks(content, []);

  // Node slot metadata duplicates the graph-level link table in LiteGraph's
  // serialized format. Since compilation assigns fresh sequential link ids, the
  // cloned metadata must be rebuilt as well. Leaving the editor ids in place makes
  // getInputData() read an unrelated link (or no link at all) after configure().
  const inputLinks = new Map<string, number>();
  const outputLinks = new Map<string, number[]>();
  const slotKey = (nodeId: number, slot: number): string => `${nodeId}:${slot}`;
  for (const [linkId, originId, originSlot, targetId, targetSlot] of links) {
    inputLinks.set(slotKey(targetId, targetSlot), linkId);
    const key = slotKey(originId, originSlot);
    outputLinks.set(key, [...(outputLinks.get(key) ?? []), linkId]);
  }
  const linkedNodes = nodes.map((node) => ({
    ...node,
    inputs: node.inputs?.map((input, slot) => ({
      ...input,
      link: inputLinks.get(slotKey(node.id, slot)) ?? null,
    })),
    outputs: node.outputs?.map((output, slot) => ({
      ...output,
      links: outputLinks.get(slotKey(node.id, slot)) ?? null,
    })),
  }));

  return {
    content: {
      ...shallowRest(content),
      last_node_id: nextId,
      last_link_id: nextLinkId,
      nodes: linkedNodes,
      links,
    },
    sourceMap,
  };
}

const shallowRest = (content: GraphContent): Record<string, unknown> => {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (
      key === 'nodes' ||
      key === 'links' ||
      key === 'last_node_id' ||
      key === 'last_link_id'
    )
      continue;
    rest[key] = value;
  }
  return rest;
};
