import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_EXECUTION_LIMITS,
  ExecutionLimitsService,
} from './execution-limits.service.js';
import { ProviderRuntimeService } from './provider-runtime.service.js';
import {
  ProviderService,
  type RuntimeProviderConfig,
} from './provider.service.js';

const provider = (
  key: string,
  overrides: Partial<RuntimeProviderConfig> = {},
): RuntimeProviderConfig => ({
  id: `${key}-id`,
  key,
  type: 'OPENAI_COMPATIBLE',
  displayName: key,
  baseUrl: `https://${key}.example/v1`,
  enabled: true,
  policy: { mode: 'ALLOW_ALL', allowedModels: [] },
  ...overrides,
});

describe('ProviderRuntimeService', () => {
  const originalFetch = global.fetch;
  const enabledRuntimeProviders = jest.fn();
  const runtimeById = jest.fn();
  const runtimeByKey = jest.fn();
  const readLimits = jest.fn();
  let service: ProviderRuntimeService;

  beforeEach(async () => {
    enabledRuntimeProviders.mockReset();
    runtimeById.mockReset();
    runtimeByKey.mockReset();
    readLimits.mockReset();
    readLimits.mockResolvedValue(DEFAULT_EXECUTION_LIMITS);
    const module = await Test.createTestingModule({
      providers: [
        ProviderRuntimeService,
        {
          provide: ProviderService,
          useValue: {
            enabledRuntimeProviders,
            runtimeById,
            runtimeByKey,
          },
        },
        {
          provide: ExecutionLimitsService,
          useValue: { get: readLimits },
        },
      ],
    }).compile();
    service = module.get(ProviderRuntimeService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('isolates probe failures and keeps duplicate model ids provider-scoped', async () => {
    enabledRuntimeProviders.mockResolvedValue([
      provider('working'),
      provider('offline'),
      provider('also-working'),
    ]);
    global.fetch = jest.fn(async (input) => {
      const url = input.toString();
      if (url.includes('offline')) throw new Error('network down');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'shared-model',
              supported_parameters: ['temperature', 'unknown-parameter'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const catalog = await service.catalog();

    expect(catalog.providers).toEqual([
      expect.objectContaining({ providerKey: 'working', status: 'AVAILABLE' }),
      expect.objectContaining({
        providerKey: 'offline',
        status: 'UNREACHABLE',
      }),
      expect.objectContaining({
        providerKey: 'also-working',
        status: 'AVAILABLE',
      }),
    ]);
    expect(catalog.models).toEqual([
      expect.objectContaining({
        ref: { providerKey: 'working', modelId: 'shared-model' },
        capabilities: { supportedParameters: ['temperature'] },
      }),
      expect.objectContaining({
        ref: { providerKey: 'also-working', modelId: 'shared-model' },
      }),
    ]);
  });

  it('offers only the models each provider policy permits', async () => {
    enabledRuntimeProviders.mockResolvedValue([
      provider('curated', {
        policy: { mode: 'ALLOWLIST', allowedModels: ['kept', 'vanished'] },
      }),
      provider('closed', { policy: { mode: 'DENY_ALL', allowedModels: [] } }),
      provider('open'),
      provider('unchosen', { policy: { mode: null, allowedModels: [] } }),
    ]);
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ data: [{ id: 'kept' }, { id: 'other' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const catalog = await service.catalog();

    expect(catalog.models.map((model) => model.ref)).toEqual([
      { providerKey: 'curated', modelId: 'kept' },
      { providerKey: 'open', modelId: 'kept' },
      { providerKey: 'open', modelId: 'other' },
    ]);
    // Every provider keeps reporting its reachability, policy notwithstanding.
    expect(catalog.providers).toHaveLength(4);
  });

  it('shows the facilitator the unfiltered catalog with allowed models marked', async () => {
    runtimeById.mockResolvedValue(
      provider('curated', {
        policy: { mode: 'ALLOWLIST', allowedModels: ['kept'] },
      }),
    );
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'kept' }, { id: 'other' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(service.providerCatalog('curated-id')).resolves.toEqual({
      status: 'AVAILABLE',
      models: [
        { modelId: 'kept', label: 'kept', allowed: true },
        { modelId: 'other', label: 'other', allowed: false },
      ],
    });
  });

  it('rejects a policy-excluded model without contacting the provider', async () => {
    runtimeByKey.mockResolvedValue(
      provider('curated', {
        policy: { mode: 'ALLOWLIST', allowedModels: ['kept'] },
      }),
    );
    global.fetch = jest.fn();

    await expect(
      service.complete({
        modelRef: { providerKey: 'curated', modelId: 'excluded' },
        messages: [],
        parameters: {},
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MODEL_UNAVAILABLE' }),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('caches discovery until invalidated', async () => {
    enabledRuntimeProviders.mockResolvedValue([provider('working')]);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await service.catalog();
    await service.catalog();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    service.invalidateCatalog();
    await service.catalog();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the OpenAI-compatible v1 namespace for model workers', async () => {
    enabledRuntimeProviders.mockResolvedValue([
      provider('local', {
        type: 'MODEL_WORKER',
        baseUrl: 'http://model-worker:8000',
      }),
    ]);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'local-model' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await service.catalog();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://model-worker:8000/v1/models',
      expect.anything(),
    );
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'UNAUTHORIZED'],
    [500, 'UNREACHABLE'],
  ] as const)('classifies HTTP %s probes as %s', async (status, expected) => {
    runtimeById.mockResolvedValue(provider('tested'));
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status }));

    await expect(service.test('tested-id')).resolves.toEqual({
      status: expected,
    });
  });

  it('classifies malformed discovery payloads without leaking details', async () => {
    runtimeById.mockResolvedValue(provider('tested'));
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: ['secret internal response'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(service.test('tested-id')).resolves.toEqual({
      status: 'INVALID_RESPONSE',
    });
  });

  it('rejects disabled and unavailable composite routes before generation', async () => {
    runtimeByKey.mockResolvedValue(provider('disabled', { enabled: false }));

    await expect(
      service.complete({
        modelRef: { providerKey: 'disabled', modelId: 'model-a' },
        messages: [],
        parameters: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    runtimeByKey.mockResolvedValue(provider('working'));
    enabledRuntimeProviders.mockResolvedValue([provider('working')]);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'different-model' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      service.complete({
        modelRef: { providerKey: 'working', modelId: 'missing-model' },
        messages: [],
        parameters: {},
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MODEL_UNAVAILABLE' }),
    });
  });

  it('holds provider requests to the deployment-wide limit', async () => {
    readLimits.mockResolvedValue({
      ...DEFAULT_EXECUTION_LIMITS,
      providerConcurrentRequests: 1,
    });
    const local = provider('local', {
      type: 'MODEL_WORKER',
      baseUrl: 'http://model-worker:8000',
    });
    runtimeByKey.mockResolvedValue(local);
    enabledRuntimeProviders.mockResolvedValue([local]);
    let inFlight = 0;
    let peak = 0;
    let releaseFirst: (() => void) | undefined;
    const firstInFlight = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let started = 0;
    global.fetch = jest.fn(async (input) => {
      const url = input.toString();
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'local-model' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      started += 1;
      if (started === 1) await firstInFlight;
      inFlight -= 1;
      return new Response(
        JSON.stringify({
          id: 'completion-1',
          object: 'chat.completion',
          created: 1,
          model: 'local-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'answer' },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const request = {
      modelRef: { providerKey: 'local', modelId: 'local-model' },
      messages: [{ role: 'user', content: 'Question' }],
      parameters: {},
    };
    const runs = Promise.all([
      service.complete(request),
      service.complete(request),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toBe(1);

    releaseFirst!();
    await runs;
    expect(peak).toBe(1);
  });

  it('executes through the AI SDK and reports ignored parameters', async () => {
    const local = provider('local', {
      type: 'MODEL_WORKER',
      baseUrl: 'http://model-worker:8000',
    });
    runtimeByKey.mockResolvedValue(local);
    enabledRuntimeProviders.mockResolvedValue([local]);
    global.fetch = jest.fn(async (input, init) => {
      const url = input.toString();
      if (url.endsWith('/models'))
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'local-model',
                supported_parameters: ['temperature'],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      const headers = new Headers(init?.headers);
      expect(url).toBe('http://model-worker:8000/v1/chat/completions');
      expect(headers.has('authorization')).toBe(false);
      return new Response(
        JSON.stringify({
          id: 'completion-1',
          object: 'chat.completion',
          created: 1,
          model: 'local-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'deterministic answer' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 2,
            total_tokens: 4,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await expect(
      service.complete({
        modelRef: { providerKey: 'local', modelId: 'local-model' },
        messages: [{ role: 'user', content: 'Question' }],
        parameters: { temperature: 0.2, top_k: 20 },
      }),
    ).resolves.toEqual({
      text: 'deterministic answer',
      warnings: [
        {
          code: 'UNSUPPORTED_MODEL_PARAMETER',
          parameter: 'top_k',
          providerKey: 'local',
          modelId: 'local-model',
        },
      ],
    });
  });
});
