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
  [key: string]: unknown;
};

export class TemplateContentError extends Error {}

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
 */
export function graphNodeTypes(content: GraphContent): string[] {
  return [...new Set(content.nodes.map((node) => node.type))].sort();
}
