/**
 * Reserved provider keys. These are serialized into workflow content, so they must be
 * identical across every deployment or migrated workflows will not resolve.
 */
export const PROVIDER_KEY_LOCAL = 'local'
export const PROVIDER_KEY_OPENAI = 'openai'
export const PROVIDER_KEY_OPENROUTER = 'openrouter'
export const PROVIDER_KEY_KATALYST = 'katalyst'
export const KATALYST_MODEL_QWEN_FLASH = 'qwen3.8-flash-next'

export const RESERVED_PROVIDER_KEYS = [
  PROVIDER_KEY_LOCAL,
  PROVIDER_KEY_OPENAI,
  PROVIDER_KEY_OPENROUTER,
  PROVIDER_KEY_KATALYST
] as const

/**
 * A model selection, qualified by the provider it belongs to (SPEC-0010/FR-004).
 *
 * The bare `model` id it replaces was ambiguous as soon as two providers offered the
 * same id, and it gave execution no way to know where to route.
 */
export type ModelRef = {
  providerKey: string
  modelId: string
}

export const MODEL_PARAMETERS = [
  'max_tokens',
  'temperature',
  'top_p',
  'top_k',
  'presence_penalty'
] as const

export type ModelParameter = (typeof MODEL_PARAMETERS)[number]

export type ModelCapabilities = {
  supportedParameters: ModelParameter[]
  contextWindow?: number
}

export type ModelCatalogEntry = {
  ref: ModelRef
  label: string
  providerName: string
  capabilities: ModelCapabilities
}

export type ProviderStatusCode =
  'AVAILABLE' | 'TIMEOUT' | 'UNAUTHORIZED' | 'UNREACHABLE' | 'INVALID_RESPONSE'

export type ModelCatalogProviderStatus = {
  providerKey: string
  providerName: string
  status: ProviderStatusCode
}

export type ModelCatalog = {
  models: ModelCatalogEntry[]
  providers: ModelCatalogProviderStatus[]
  /**
   * The facilitator's deployment-wide default. Nodes without an explicit `model_ref`
   * execute against this model; `null` means every model node needs its own selection.
   */
  defaultModel: ModelRef | null
}

export type ModelExecutionWarning = {
  code: 'UNSUPPORTED_MODEL_PARAMETER'
  parameter: ModelParameter
  providerKey: string
  modelId: string
}

export type ModelCompletionRequest = {
  modelRef: ModelRef
  messages: { role: string; content: string }[]
  parameters: Partial<Record<ModelParameter, number>>
  signal?: AbortSignal
}

export type ModelCompletionResult = {
  text: string
  warnings: ModelExecutionWarning[]
}

/** Backend-only implementation. The interface carries zero credentials. */
export interface ModelCompletionRuntime {
  complete(request: ModelCompletionRequest): Promise<ModelCompletionResult>
}

export const isModelRef = (value: unknown): value is ModelRef => {
  if (typeof value !== 'object' || value === null) return false
  const providerKey: unknown = Reflect.get(value, 'providerKey')
  const modelId: unknown = Reflect.get(value, 'modelId')
  return (
    typeof providerKey === 'string' &&
    providerKey.length > 0 &&
    typeof modelId === 'string' &&
    modelId.length > 0
  )
}
