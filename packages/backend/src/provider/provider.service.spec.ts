import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma.service.js';
import { ProviderCredentialCipher } from './provider-credential-cipher.js';
import { ProviderService } from './provider.service.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64url');
const now = new Date('2026-09-16T00:00:00.000Z');
const storedProvider = (
  overrides: Partial<{
    id: string;
    key: string;
    type: 'OPENAI' | 'OPENAI_COMPATIBLE';
    displayName: string;
    baseUrl: string | null;
    apiKeyEnc: string | null;
    apiKeyHint: string | null;
    enabled: boolean;
  }> = {},
) => ({
  id: 'provider-id',
  key: 'openai',
  type: 'OPENAI' as const,
  displayName: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyEnc: 'encrypted-existing-key',
  apiKeyHint: '••••sting',
  enabled: true,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('ProviderService', () => {
  const originalEnvironment = {
    encryptionKey: process.env.PROVIDER_ENCRYPTION_KEY,
    modelWorkerUrl: process.env.MODEL_WORKER_URL,
    openAiKey: process.env.OPENAI_API_KEY,
    openRouterKey: process.env.OPENROUTER_API_KEY,
    bearerToken: process.env.BEARER_TOKEN,
  };
  const findUnique = jest.fn();
  const findUniqueOrThrow = jest.fn();
  const findMany = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  let service: ProviderService;
  let cipher: ProviderCredentialCipher;

  beforeEach(async () => {
    process.env.PROVIDER_ENCRYPTION_KEY = encryptionKey;
    delete process.env.MODEL_WORKER_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.BEARER_TOKEN;
    findUnique.mockReset();
    findUniqueOrThrow.mockReset();
    findMany.mockReset();
    create.mockReset();
    update.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        ProviderService,
        ProviderCredentialCipher,
        {
          provide: PrismaService,
          useValue: {
            provider: {
              findUnique,
              findUniqueOrThrow,
              findMany,
              create,
              update,
            },
          },
        },
      ],
    }).compile();
    service = module.get(ProviderService);
    cipher = module.get(ProviderCredentialCipher);
  });

  afterAll(() => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('PROVIDER_ENCRYPTION_KEY', originalEnvironment.encryptionKey);
    restore('MODEL_WORKER_URL', originalEnvironment.modelWorkerUrl);
    restore('OPENAI_API_KEY', originalEnvironment.openAiKey);
    restore('OPENROUTER_API_KEY', originalEnvironment.openRouterKey);
    restore('BEARER_TOKEN', originalEnvironment.bearerToken);
  });

  it('keeps saved built-in rows authoritative during idempotent seeding', async () => {
    process.env.OPENAI_API_KEY = 'later-environment-key';
    findUnique.mockResolvedValue({ id: 'already-saved' });
    findMany.mockResolvedValue([]);

    await service.ensureInitialized();

    expect(findUnique).toHaveBeenCalledTimes(3);
    expect(create).not.toHaveBeenCalled();
  });

  it('repairs the legacy enabled local provider with an empty base URL', async () => {
    process.env.MODEL_WORKER_URL = 'http://model-worker:8000';
    findUnique
      .mockResolvedValueOnce({ id: 'local-id', baseUrl: null })
      .mockResolvedValueOnce({
        id: 'openai-id',
        baseUrl: 'https://saved-openai.example/v1',
      })
      .mockResolvedValueOnce({
        id: 'openrouter-id',
        baseUrl: 'https://saved-openrouter.example/v1',
      });
    findMany.mockResolvedValue([]);

    await service.ensureInitialized();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'local-id' },
      data: { baseUrl: 'http://model-worker:8000' },
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns credential metadata without encrypted or plaintext secrets', async () => {
    findMany.mockResolvedValue([
      storedProvider({
        apiKeyEnc: cipher.encrypt('super-secret-provider-key'),
        apiKeyHint: '••••-key',
      }),
    ]);

    const result = await service.list();
    const serialized = JSON.stringify(result);

    expect(result).toEqual([
      expect.objectContaining({ hasApiKey: true, apiKeyHint: '••••-key' }),
    ]);
    expect(serialized).not.toContain('apiKeyEnc');
    expect(serialized).not.toContain('super-secret-provider-key');
  });

  it('keeps an existing credential when update mode is KEEP', async () => {
    const current = storedProvider();
    findUnique.mockResolvedValue(current);
    findUniqueOrThrow.mockResolvedValue(current);
    update.mockResolvedValue(current);

    await service.update(current.id, {
      displayName: 'Renamed OpenAI',
      credential: { mode: 'KEEP' },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ apiKeyEnc: expect.anything() }),
      }),
    );
  });

  it('encrypts replacement credentials and stores only a safe hint', async () => {
    const current = storedProvider();
    findUnique.mockResolvedValue(current);
    findUniqueOrThrow.mockResolvedValue(current);
    update.mockResolvedValue(current);

    await service.update(current.id, {
      credential: { mode: 'REPLACE', value: 'replacement-secret' },
    });

    const data = update.mock.calls[0][0].data;
    expect(data.apiKeyEnc).not.toBe('replacement-secret');
    expect(cipher.decrypt(data.apiKeyEnc)).toBe('replacement-secret');
    expect(data.apiKeyHint).toBe('••••cret');
  });

  it('removes credentials from credential-free compatible providers', async () => {
    const current = storedProvider({
      key: 'custom-provider',
      type: 'OPENAI_COMPATIBLE',
    });
    findUnique.mockResolvedValue(current);
    findUniqueOrThrow.mockResolvedValue({
      ...current,
      apiKeyEnc: null,
      apiKeyHint: null,
    });
    update.mockResolvedValue(current);

    await service.update(current.id, { credential: { mode: 'REMOVE' } });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ apiKeyEnc: null, apiKeyHint: null }),
      }),
    );
  });

  it('requires credentials for enabled OpenAI providers', async () => {
    const current = storedProvider();
    findUnique.mockResolvedValue(current);

    await expect(
      service.update(current.id, { credential: { mode: 'REMOVE' } }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROVIDER_CREDENTIAL_REQUIRED',
      }),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports unavailable encryption when replacement stores a secret', async () => {
    delete process.env.PROVIDER_ENCRYPTION_KEY;
    const current = storedProvider({
      key: 'custom-provider',
      type: 'OPENAI_COMPATIBLE',
    });
    findUnique.mockResolvedValue(current);

    await expect(
      service.update(current.id, {
        credential: { mode: 'REPLACE', value: 'replacement-secret' },
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(update).not.toHaveBeenCalled();
  });
});
