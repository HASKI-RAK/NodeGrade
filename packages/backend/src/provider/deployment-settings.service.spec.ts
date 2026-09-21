import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma.service.js';
import {
  DEPLOYMENT_SETTINGS_ID,
  DeploymentSettingsService,
} from './deployment-settings.service.js';
import type { RuntimeProviderConfig } from './provider.service.js';
import { ProviderService } from './provider.service.js';

const provider = (
  overrides: Partial<RuntimeProviderConfig> = {},
): RuntimeProviderConfig => ({
  id: 'provider-id',
  key: 'openai',
  type: 'OPENAI_COMPATIBLE',
  displayName: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  policy: { mode: 'ALLOW_ALL', allowedModels: [] },
  ...overrides,
});

describe('DeploymentSettingsService', () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const runtimeByKey = jest.fn();
  let service: DeploymentSettingsService;

  beforeEach(async () => {
    findUnique.mockReset();
    upsert.mockReset();
    runtimeByKey.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        DeploymentSettingsService,
        {
          provide: PrismaService,
          useValue: { deploymentSettings: { findUnique, upsert } },
        },
        { provide: ProviderService, useValue: { runtimeByKey } },
      ],
    }).compile();
    service = module.get(DeploymentSettingsService);
  });

  it('reads no stored default as null', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.get()).resolves.toEqual({ defaultModel: null });
  });

  it('reads a half-stored row as null rather than a broken reference', async () => {
    findUnique.mockResolvedValue({
      defaultProviderKey: 'openai',
      defaultModelId: null,
    });

    await expect(service.get()).resolves.toEqual({ defaultModel: null });
  });

  it('saves a default against an enabled, permitting provider', async () => {
    runtimeByKey.mockResolvedValue(provider());

    await expect(
      service.update({ providerKey: 'openai', modelId: 'gpt-5' }),
    ).resolves.toEqual({
      defaultModel: { providerKey: 'openai', modelId: 'gpt-5' },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { id: DEPLOYMENT_SETTINGS_ID },
      create: {
        id: DEPLOYMENT_SETTINGS_ID,
        defaultProviderKey: 'openai',
        defaultModelId: 'gpt-5',
      },
      update: { defaultProviderKey: 'openai', defaultModelId: 'gpt-5' },
    });
  });

  it('clears the default when both halves are null', async () => {
    await expect(
      service.update({ providerKey: null, modelId: null }),
    ).resolves.toEqual({ defaultModel: null });
    expect(upsert).toHaveBeenCalledWith({
      where: { id: DEPLOYMENT_SETTINGS_ID },
      create: { id: DEPLOYMENT_SETTINGS_ID },
      update: { defaultProviderKey: null, defaultModelId: null },
    });
  });

  it.each([
    [{ providerKey: 'openai', modelId: null }],
    [{ providerKey: null, modelId: 'gpt-5' }],
    [{ providerKey: 'openai' }],
    [{ modelId: 'gpt-5' }],
  ])('rejects a half-set default (%j)', async (body) => {
    await expect(service.update(body)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DEFAULT_MODEL_INCOMPLETE' }),
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider', async () => {
    runtimeByKey.mockRejectedValue(
      new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: 'Provider was not found.',
      }),
    );

    await expect(
      service.update({ providerKey: 'missing', modelId: 'gpt-5' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DEFAULT_MODEL_UNKNOWN_PROVIDER',
      }),
    });
  });

  it('rejects a disabled provider', async () => {
    runtimeByKey.mockResolvedValue(provider({ enabled: false }));

    await expect(
      service.update({ providerKey: 'openai', modelId: 'gpt-5' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DEFAULT_MODEL_PROVIDER_DISABLED',
      }),
    });
  });

  it('rejects a model the provider policy excludes', async () => {
    runtimeByKey.mockResolvedValue(
      provider({ policy: { mode: 'ALLOWLIST', allowedModels: ['kept'] } }),
    );

    await expect(
      service.update({ providerKey: 'openai', modelId: 'excluded' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DEFAULT_MODEL_NOT_PERMITTED',
      }),
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('keeps an allowlisted model the policy names', async () => {
    runtimeByKey.mockResolvedValue(
      provider({ policy: { mode: 'ALLOWLIST', allowedModels: ['kept'] } }),
    );

    await expect(
      service.update({ providerKey: 'openai', modelId: 'kept' }),
    ).resolves.toEqual({
      defaultModel: { providerKey: 'openai', modelId: 'kept' },
    });
  });

  it('throws BadRequestException (not a bare error) for validation failures', async () => {
    runtimeByKey.mockResolvedValue(provider({ enabled: false }));

    const error = await service
      .update({ providerKey: 'openai', modelId: 'gpt-5' })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(BadRequestException);
  });
});
