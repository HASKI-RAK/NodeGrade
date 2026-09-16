import { BadRequestException, Injectable } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import {
  MODEL_PARAMETERS,
  type ModelCapabilities,
  type ModelCatalog,
  type ModelCatalogEntry,
  type ModelCompletionRequest,
  type ModelCompletionResult,
  type ModelCompletionRuntime,
  type ModelParameter,
  type ProviderStatusCode,
} from '@haski/ta-lib';
import { generateText, type ModelMessage } from 'ai';
import {
  ProviderService,
  type RuntimeProviderConfig,
} from './provider.service.js';

const CATALOG_TTL_MS = 5_000;
const PROBE_TIMEOUT_MS = 5_000;
const isModelParameter = (value: unknown): value is ModelParameter =>
  typeof value === 'string' &&
  MODEL_PARAMETERS.some((parameter) => parameter === value);

type ProviderProbe = {
  status: ProviderStatusCode;
  models: ModelCatalogEntry[];
};

type ModelRecord = {
  id: string;
  name?: string;
  context_length?: number;
  context_window?: number;
  supported_parameters?: unknown;
};

const isModelRecord = (value: unknown): value is ModelRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const id: unknown = Reflect.get(value, 'id');
  return typeof id === 'string' && id.length > 0;
};

const fallbackParameters = (
  type: RuntimeProviderConfig['type'],
): ModelParameter[] =>
  type === 'MODEL_WORKER'
    ? ['max_tokens', 'temperature', 'top_p']
    : type === 'OPENAI'
      ? ['max_tokens', 'temperature', 'top_p', 'presence_penalty']
      : [...MODEL_PARAMETERS];

const providerApiBaseUrl = (provider: RuntimeProviderConfig): string => {
  const baseUrl = provider.baseUrl.replace(/\/$/, '');
  return provider.type === 'MODEL_WORKER' && !baseUrl.endsWith('/v1')
    ? `${baseUrl}/v1`
    : baseUrl;
};

const capabilities = (
  provider: RuntimeProviderConfig,
  model: ModelRecord,
): ModelCapabilities => {
  const supported = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.filter(isModelParameter)
    : fallbackParameters(provider.type);
  const contextWindow = model.context_length ?? model.context_window;
  return {
    supportedParameters: supported,
    ...(typeof contextWindow === 'number' ? { contextWindow } : {}),
  };
};

@Injectable()
export class ProviderRuntimeService implements ModelCompletionRuntime {
  private cached?: { expiresAt: number; value: ModelCatalog };

  constructor(private readonly providers: ProviderService) {}

  invalidateCatalog(): void {
    this.cached = undefined;
  }

  async catalog(): Promise<ModelCatalog> {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.value;
    const providers = await this.providers.enabledRuntimeProviders();
    const results = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        probe: await this.probe(provider),
      })),
    );
    const value: ModelCatalog = {
      models: results.flatMap(({ probe }) => probe.models),
      providers: results.map(({ provider, probe }) => ({
        providerKey: provider.key,
        providerName: provider.displayName,
        status: probe.status,
      })),
    };
    this.cached = { expiresAt: Date.now() + CATALOG_TTL_MS, value };
    return value;
  }

  async test(id: string): Promise<{ status: ProviderStatusCode }> {
    const provider = await this.providers.runtimeById(id);
    const probe = await this.probe(provider);
    return { status: probe.status };
  }

  private async probe(provider: RuntimeProviderConfig): Promise<ProviderProbe> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const headers = new Headers({ Accept: 'application/json' });
      if (provider.apiKey)
        headers.set('Authorization', `Bearer ${provider.apiKey}`);
      const response = await fetch(`${providerApiBaseUrl(provider)}/models`, {
        headers,
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403)
        return { status: 'UNAUTHORIZED', models: [] };
      if (!response.ok) return { status: 'UNREACHABLE', models: [] };
      const payload: unknown = await response.json();
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('data' in payload) ||
        !Array.isArray(payload.data)
      )
        return { status: 'INVALID_RESPONSE', models: [] };
      const records = payload.data.filter(isModelRecord);
      if (records.length !== payload.data.length)
        return { status: 'INVALID_RESPONSE', models: [] };
      return {
        status: 'AVAILABLE',
        models: records.map((model) => ({
          ref: { providerKey: provider.key, modelId: model.id },
          label: model.name || model.id,
          providerName: provider.displayName,
          capabilities: capabilities(provider, model),
        })),
      };
    } catch (error) {
      return {
        status:
          error instanceof Error && error.name === 'AbortError'
            ? 'TIMEOUT'
            : error instanceof SyntaxError
              ? 'INVALID_RESPONSE'
              : 'UNREACHABLE',
        models: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async complete(
    request: ModelCompletionRequest,
  ): Promise<ModelCompletionResult> {
    const provider = await this.providers.runtimeByKey(
      request.modelRef.providerKey,
    );
    if (!provider.enabled)
      throw new BadRequestException({
        code: 'PROVIDER_DISABLED',
        message: 'Selected provider is disabled.',
      });
    const catalog = await this.catalog();
    const model = catalog.models.find(
      (entry) =>
        entry.ref.providerKey === request.modelRef.providerKey &&
        entry.ref.modelId === request.modelRef.modelId,
    );
    if (!model)
      throw new BadRequestException({
        code: 'MODEL_UNAVAILABLE',
        message: 'Selected model is unavailable.',
      });

    const warnings = MODEL_PARAMETERS.filter(
      (parameter) =>
        request.parameters[parameter] !== undefined &&
        !model.capabilities.supportedParameters.includes(parameter),
    ).map((parameter) => ({
      code: 'UNSUPPORTED_MODEL_PARAMETER' as const,
      parameter,
      providerKey: provider.key,
      modelId: model.ref.modelId,
    }));
    const allowed = (parameter: ModelParameter): number | undefined =>
      model.capabilities.supportedParameters.includes(parameter)
        ? request.parameters[parameter]
        : undefined;

    const credentialFreeFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const headers = new Headers(init?.headers);
      headers.delete('authorization');
      return fetch(input, { ...init, headers });
    };
    const openai = createOpenAI({
      name: `nodegrade-${provider.key}`,
      baseURL: providerApiBaseUrl(provider),
      apiKey: provider.apiKey ?? 'credential-free',
      fetch: provider.apiKey ? undefined : credentialFreeFetch,
    });
    const messages: ModelMessage[] = request.messages.map((message) => ({
      role:
        message.role === 'system' ||
        message.role === 'assistant' ||
        message.role === 'user'
          ? message.role
          : 'user',
      content: message.content,
    }));
    const result = await generateText({
      model: openai.chat(model.ref.modelId),
      messages,
      abortSignal: request.signal,
      maxOutputTokens: allowed('max_tokens'),
      temperature: allowed('temperature'),
      topP: allowed('top_p'),
      topK: allowed('top_k'),
      presencePenalty: allowed('presence_penalty'),
    });
    return { text: result.text, warnings };
  }
}
