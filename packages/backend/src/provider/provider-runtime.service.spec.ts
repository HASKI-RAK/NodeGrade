import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
  ...overrides,
});

describe('ProviderRuntimeService', () => {
  const originalFetch = global.fetch;
  const enabledRuntimeProviders = jest.fn();
  const runtimeById = jest.fn();
  const runtimeByKey = jest.fn();
  let service: ProviderRuntimeService;

  beforeEach(async () => {
    enabledRuntimeProviders.mockReset();
    runtimeById.mockReset();
    runtimeByKey.mockReset();
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
