import {
  ModelRef,
  PROVIDER_KEY_LOCAL,
  PROVIDER_KEY_OPENAI,
} from '@haski/ta-lib';

export const CONTENT_SCHEMA_VERSION = 2;

const LLM_NODE_TYPE = 'models/llm';

export type TransformOptions = {
  /** Provider keys currently enabled on this deployment. */
  enabledProviderKeys: string[];
  /** Models successfully discovered from enabled providers. */
  availableModels?: ModelRef[];
};

export type TransformResult = {
  content: string;
  /** Number of LLM nodes whose properties were rewritten. */
  changed: number;
  /** Number of nodes left needing an explicit model selection (FR-012). */
  needingSelection: number;
};

const sourceToProviderKey = (source: unknown): string | null => {
  if (source === 'openai') return PROVIDER_KEY_OPENAI;
  if (source === 'local') return PROVIDER_KEY_LOCAL;
  return null;
};

/**
 * Resolves a bare model id to a composite provider+model reference
 * (SPEC-0010/FR-011, FR-012).
 *
 * FR-012 forbids *guessing* when more than one enabled provider exposes the id. With
 * exactly one enabled provider there is only one possible answer, so resolving is not a
 * guess -- and the strict reading would be actively harmful: real stored content
 * predates `available_model_sources` entirely, so every migrated node would be marked
 * unexecutable until a human opened it.
 */
const resolveModelRef = (
  model: unknown,
  sources: unknown,
  options: TransformOptions,
): { ref: ModelRef | null; needsSelection: boolean } => {
  if (typeof model !== 'string' || model.length === 0) {
    // Nothing was ever selected, so there is nothing to resolve and nothing to fix.
    return { ref: null, needsSelection: false };
  }

  if (typeof sources === 'object' && sources !== null) {
    const known = (sources as Record<string, unknown>)[model];
    const providerKey = sourceToProviderKey(known);
    if (providerKey && options.enabledProviderKeys.includes(providerKey))
      return { ref: { providerKey, modelId: model }, needsSelection: false };
  }

  const discoveredMatches = options.availableModels?.filter(
    (entry) => entry.modelId === model,
  );
  if (discoveredMatches?.length === 1)
    return { ref: discoveredMatches[0], needsSelection: false };
  if (options.availableModels) return { ref: null, needsSelection: true };

  if (options.enabledProviderKeys.length === 1) {
    return {
      ref: { providerKey: options.enabledProviderKeys[0], modelId: model },
      needsSelection: false,
    };
  }

  return { ref: null, needsSelection: true };
};

/**
 * Adds `model_ref` and `needs_model_selection` to every LLM node in a serialized graph.
 *
 * Operates on raw parsed JSON rather than going through LGraph.configure()/serialize():
 * a round-trip requires every node type to be registered, silently drops the ones that
 * are not, and normalises structure -- which on stored content is a lossy rewrite. The
 * fixture graph alone contains node types this build does not register.
 *
 * Purely additive: `model`, `available_models` and `available_model_sources` are left in
 * place because LLMNode.onConfigure still reads them to populate the editor's model
 * dropdown.
 */
export function transformLlmModelRefs(
  content: string,
  options: TransformOptions,
): TransformResult {
  const parsed: unknown = JSON.parse(content);

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { nodes?: unknown }).nodes)
  ) {
    return { content, changed: 0, needingSelection: 0 };
  }

  const nodes = (parsed as { nodes: unknown[] }).nodes;
  let changed = 0;
  let needingSelection = 0;

  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;
    const candidate = node as Record<string, unknown>;
    if (candidate.type !== LLM_NODE_TYPE) continue;

    const properties = candidate.properties;
    if (typeof properties !== 'object' || properties === null) continue;

    const props = properties as Record<string, unknown>;
    if ('model_ref' in props) continue; // already converted

    const { ref, needsSelection } = resolveModelRef(
      props.model,
      props.available_model_sources,
      options,
    );

    props.model_ref = ref;
    props.needs_model_selection = needsSelection;

    changed += 1;
    if (needsSelection) needingSelection += 1;
  }

  return { content: JSON.stringify(parsed), changed, needingSelection };
}
