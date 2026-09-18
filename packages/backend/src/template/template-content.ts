import { createHash } from 'node:crypto';

/**
 * The parts of serialized LiteGraph content this subsystem needs to reason about.
 *
 * Deliberately structural rather than a full schema: a template is opaque canvas state
 * that the editor owns, and a strict schema here would reject perfectly good content
 * every time LiteGraph gains a field.
 */
export type GraphContent = {
  nodes: GraphNode[];
  links?: unknown[];
  [key: string]: unknown;
};

export type GraphNode = {
  id: number;
  type: string;
  inputs?: Record<string, unknown>[];
  outputs?: Record<string, unknown>[];
  properties?: Record<string, unknown>;
  subgraph?: GraphContent;
  [key: string]: unknown;
};

export class TemplateContentError extends Error {}

/** Bounds for recursive Subgraph validation (plan Gate 4). */
export const MAX_SUBGRAPH_DEPTH = 5;
export const MAX_NESTED_NODES = 500;
export const MAX_NESTED_LINKS = 2000;

export type NestedValidationIssue = {
  path: string;
  message: string;
};

export type NestedGraphSummary = {
  /** Every node type at every depth, wrapper type included. */
  nodeTypes: string[];
  /** Every models/llm node at every depth. */
  modelNodes: GraphNode[];
  totalNodes: number;
  totalLinks: number;
  maxDepth: number;
};

/**
 * Identifies content for the bundled seeder, which has to answer "is this the same
 * template I inserted last time" without a version number to go on.
 */
export const hashContent = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

export function parseGraphContent(content: string): GraphContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TemplateContentError('Template content is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TemplateContentError('Template content must be a JSON object.');
  }

  const graph = parsed as Record<string, unknown>;
  if (!Array.isArray(graph.nodes)) {
    throw new TemplateContentError(
      'Template content must contain a nodes array.',
    );
  }

  for (const node of graph.nodes) {
    if (typeof node !== 'object' || node === null) {
      throw new TemplateContentError('Every node must be an object.');
    }
    const candidate = node as Record<string, unknown>;
    if (typeof candidate.id !== 'number') {
      throw new TemplateContentError('Every node must have a numeric id.');
    }
    if (typeof candidate.type !== 'string' || candidate.type.length === 0) {
      throw new TemplateContentError('Every node must have a type.');
    }
  }

  return graph as GraphContent;
}

/**
 * The node types a template needs in order to load.
 *
 * A template referencing a type this build does not register has to be reported as
 * unavailable rather than opened: LGraph.configure() silently drops unknown nodes, so a
 * partial import looks like a working template with pieces mysteriously missing.
 *
 * Subgraph wrappers recurse: nested node types count, because a missing inner type
 * would load as a block with pieces missing.
 */
export function graphNodeTypes(content: GraphContent): string[] {
  return [...walkNested(content).nodeTypes].sort();
}

/**
 * Every models/llm node at every depth, so workshop readiness sees models hidden
 * inside inserted blocks.
 */
export function graphModelNodes(content: GraphContent): GraphNode[] {
  return walkNested(content).modelNodes;
}

type NestedWalk = {
  nodeTypes: Set<string>;
  modelNodes: GraphNode[];
  totalNodes: number;
  totalLinks: number;
  maxDepth: number;
};

const walkNested = (content: GraphContent): NestedWalk => {
  const walk: NestedWalk = {
    nodeTypes: new Set<string>(),
    modelNodes: [],
    totalNodes: 0,
    totalLinks: 0,
    maxDepth: 0,
  };
  visitGraph(content, 'template', 0, walk);
  return walk;
};

const visitGraph = (
  graph: GraphContent,
  path: string,
  depth: number,
  walk: NestedWalk,
): void => {
  walk.maxDepth = Math.max(walk.maxDepth, depth);
  walk.totalNodes += graph.nodes.length;
  walk.totalLinks += Array.isArray(graph.links) ? graph.links.length : 0;
  for (const node of graph.nodes) {
    walk.nodeTypes.add(node.type);
    if (node.type === 'models/llm') walk.modelNodes.push(node);
    if (node.type === 'graph/subgraph' && isNestedGraph(node.subgraph)) {
      visitGraph(
        node.subgraph,
        `${path} / ${nodeLabel(node)}`,
        depth + 1,
        walk,
      );
    }
  }
};

const nodeLabel = (node: GraphNode): string => {
  const title = (node as { title?: unknown }).title;
  return typeof title === 'string' && title.length > 0
    ? title
    : `node ${node.id}`;
};

const isNestedGraph = (value: unknown): value is GraphContent =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { nodes?: unknown }).nodes);

/** Cyclic fixtures cannot stringify; the cycle check below reports them. */
const safeSerializedBytes = (content: GraphContent): number | null => {
  try {
    return JSON.stringify(content).length;
  } catch {
    return null;
  }
};

/**
 * Recursive Subgraph validation (plan Gate 4): registered types at every depth,
 * unique ids per graph scope, valid internal link endpoints and slots, boundary keys,
 * directions and referenced internal slots, acyclic containment, bounded nesting depth,
 * and JSON size plus node-count limits across the full nested graph.
 *
 * Boundary entries are validated structurally here. Semantic validation against the
 * revision's declared interfaces happens at insertion time in the editor, which owns
 * the boundary contract.
 */
export function validateNestedGraph(
  content: GraphContent,
  options: {
    registeredType?: (type: string) => boolean;
    maxDepth?: number;
    maxNodes?: number;
    maxLinks?: number;
    maxBytes?: number;
  } = {},
): NestedValidationIssue[] {
  const issues: NestedValidationIssue[] = [];
  const maxDepth = options.maxDepth ?? MAX_SUBGRAPH_DEPTH;
  const maxNodes = options.maxNodes ?? MAX_NESTED_NODES;
  const maxLinks = options.maxLinks ?? MAX_NESTED_LINKS;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const registeredType = options.registeredType ?? (() => true);

  const serializedBytes = safeSerializedBytes(content);
  if (serializedBytes !== null && serializedBytes > maxBytes) {
    issues.push({
      path: 'template',
      message: `Serialized graph is ${serializedBytes} bytes, above the ${maxBytes} byte limit.`,
    });
  }

  const ancestors = new Set<GraphContent>();
  validateGraph(content, 'template', 0, ancestors, issues, {
    maxDepth,
    maxNodes: { limit: maxNodes, count: 0 },
    maxLinks: { limit: maxLinks, count: 0 },
    registeredType,
  });
  return issues;
}

type Budget = { limit: number; count: number };

const validateGraph = (
  graph: GraphContent,
  path: string,
  depth: number,
  ancestors: Set<GraphContent>,
  issues: NestedValidationIssue[],
  budgets: {
    maxDepth: number;
    maxNodes: Budget;
    maxLinks: Budget;
    registeredType: (type: string) => boolean;
  },
): void => {
  if (ancestors.has(graph)) {
    issues.push({ path, message: 'Subgraph containment is cyclic.' });
    return;
  }
  if (depth > budgets.maxDepth) {
    issues.push({
      path,
      message: `Nesting depth ${depth} exceeds the limit of ${budgets.maxDepth}.`,
    });
    return;
  }
  ancestors.add(graph);

  budgets.maxNodes.count += graph.nodes.length;
  if (budgets.maxNodes.count > budgets.maxNodes.limit) {
    issues.push({
      path,
      message: `Nested graph exceeds the node limit of ${budgets.maxNodes.limit}.`,
    });
  }
  const links = Array.isArray(graph.links) ? graph.links : [];
  budgets.maxLinks.count += links.length;
  if (budgets.maxLinks.count > budgets.maxLinks.limit) {
    issues.push({
      path,
      message: `Nested graph exceeds the link limit of ${budgets.maxLinks.limit}.`,
    });
  }

  const ids = new Set<number>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      issues.push({
        path,
        message: `Duplicate node id ${node.id} within one graph scope.`,
      });
    }
    ids.add(node.id);
    if (!budgets.registeredType(node.type) && node.type !== 'graph/subgraph') {
      issues.push({
        path,
        message: `Node type "${node.type}" is not registered.`,
      });
    }
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  links.forEach((link, index) => {
    const entry = Array.isArray(link) ? link : [];
    const [, originId, originSlot, targetId, targetSlot] = entry as [
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
    ];
    const origin =
      typeof originId === 'number' ? byId.get(originId) : undefined;
    const target =
      typeof targetId === 'number' ? byId.get(targetId) : undefined;
    if (!origin || !target) {
      issues.push({
        path,
        message: `Link ${index} points at a node this graph scope does not contain.`,
      });
      return;
    }
    if (!slotExists(origin.outputs, originSlot)) {
      issues.push({
        path,
        message: `Link ${index} references missing output slot ${String(originSlot)} on node ${origin.id}.`,
      });
    }
    if (!slotExists(target.inputs, targetSlot)) {
      issues.push({
        path,
        message: `Link ${index} references missing input slot ${String(targetSlot)} on node ${target.id}.`,
      });
    }
  });

  for (const node of graph.nodes) {
    if (node.type !== 'graph/subgraph') continue;
    const nestedPath = `${path} / ${nodeLabel(node)}`;
    if (!isNestedGraph(node.subgraph)) {
      issues.push({
        path: nestedPath,
        message: 'Subgraph wrapper has no nested graph content.',
      });
      continue;
    }
    validateBoundary(node, nestedPath, issues);
    validateGraph(
      node.subgraph,
      nestedPath,
      depth + 1,
      ancestors,
      issues,
      budgets,
    );
  }

  ancestors.delete(graph);
};

const slotExists = (slots: unknown, slot: unknown): boolean => {
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0)
    return false;
  return Array.isArray(slots) && slots.length > slot;
};

const validateBoundary = (
  node: GraphNode,
  path: string,
  issues: NestedValidationIssue[],
): void => {
  const properties = node.properties;
  if (typeof properties !== 'object' || properties === null) return;
  const boundary = Reflect.get(properties, 'templateBoundary');
  if (boundary === undefined) return;
  if (!Array.isArray(boundary)) {
    issues.push({ path, message: 'Boundary metadata is not an array.' });
    return;
  }
  const nested = isNestedGraph(node.subgraph)
    ? new Map(node.subgraph.nodes.map((inner) => [inner.id, inner]))
    : new Map<number, GraphNode>();
  const keys = new Set<string>();
  for (const entry of boundary) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push({ path, message: 'Boundary entry must be an object.' });
      continue;
    }
    const port = entry as Record<string, unknown>;
    if (typeof port.key !== 'string' || port.key.length === 0) {
      issues.push({ path, message: 'Boundary entry has no key.' });
      continue;
    }
    if (keys.has(port.key)) {
      issues.push({
        path,
        message: `Boundary key ${port.key} is duplicated.`,
      });
    }
    keys.add(port.key);
    if (port.direction !== 'input' && port.direction !== 'output') {
      issues.push({
        path,
        message: `Boundary key ${port.key} has an unknown direction.`,
      });
      continue;
    }
    const internalId = port.internalNodeId;
    const internalSlot = port.internalSlot;
    if (
      typeof internalId !== 'number' ||
      typeof internalSlot !== 'number' ||
      !Number.isInteger(internalSlot) ||
      internalSlot < 0
    ) {
      issues.push({
        path,
        message: `Boundary key ${port.key} references an invalid internal slot.`,
      });
      continue;
    }
    const inner = nested.get(internalId);
    if (!inner) {
      issues.push({
        path,
        message: `Boundary key ${port.key} references node ${String(internalId)}, which the nested graph does not contain.`,
      });
      continue;
    }
    const slots = port.direction === 'input' ? inner.inputs : inner.outputs;
    if (!Array.isArray(slots) || slots.length <= internalSlot) {
      issues.push({
        path,
        message: `Boundary key ${port.key} references missing ${String(port.direction)} slot ${String(internalSlot)}.`,
      });
    }
  }
};
