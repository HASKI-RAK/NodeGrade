import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PROVIDER_KEY_LOCAL,
  PROVIDER_KEY_OPENAI,
  PROVIDER_KEY_OPENROUTER,
} from '@haski/ta-lib';
import { randomUUID } from 'node:crypto';
import type { ProviderType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma.service.js';
import type {
  CreateProviderDto,
  CredentialUpdateDto,
  UpdateProviderDto,
} from './dto/provider.dto.js';
import {
  ProviderCredentialCipher,
  ProviderEncryptionUnavailableError,
} from './provider-credential-cipher.js';

type SeedProvider = {
  key: string;
  type: ProviderType;
  displayName: string;
  baseUrl: string | null;
  enabled: boolean;
  apiKey?: string;
};

export type RuntimeProviderConfig = {
  id: string;
  key: string;
  type: ProviderType;
  displayName: string;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
};

const safeHint = (value: string): string => `••••${value.slice(-4)}`;

@Injectable()
export class ProviderService implements OnApplicationBootstrap {
  private initialization?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: ProviderCredentialCipher,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return this.ensureInitialized();
  }

  ensureInitialized(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }

  private seeds(): SeedProvider[] {
    const modelWorkerUrl = process.env.MODEL_WORKER_URL?.trim();
    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
    return [
      {
        key: PROVIDER_KEY_LOCAL,
        type: 'MODEL_WORKER',
        displayName: 'Local model worker',
        baseUrl: modelWorkerUrl || null,
        enabled: Boolean(modelWorkerUrl),
        apiKey: process.env.BEARER_TOKEN?.trim() || undefined,
      },
      {
        key: PROVIDER_KEY_OPENAI,
        type: 'OPENAI',
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        enabled: Boolean(openAiKey),
        apiKey: openAiKey || undefined,
      },
      {
        key: PROVIDER_KEY_OPENROUTER,
        type: 'OPENROUTER',
        displayName: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        enabled: Boolean(openRouterKey),
        apiKey: openRouterKey || undefined,
      },
    ];
  }

  private async initialize(): Promise<void> {
    for (const seed of this.seeds()) {
      const existing = await this.prisma.provider.findUnique({
        where: { key: seed.key },
        select: { id: true, baseUrl: true },
      });
      if (existing) {
        if (
          seed.key === PROVIDER_KEY_LOCAL &&
          existing.baseUrl === null &&
          seed.baseUrl
        )
          await this.prisma.provider.update({
            where: { id: existing.id },
            data: { baseUrl: seed.baseUrl },
          });
        continue;
      }
      const apiKeyEnc = seed.apiKey ? this.cipher.encrypt(seed.apiKey) : null;
      await this.prisma.provider.create({
        data: {
          key: seed.key,
          type: seed.type,
          displayName: seed.displayName,
          baseUrl: seed.baseUrl,
          enabled: seed.enabled,
          apiKeyEnc,
          apiKeyHint: seed.apiKey ? safeHint(seed.apiKey) : null,
          modelPolicy: {
            create: { mode: seed.enabled ? 'ALLOW_ALL' : 'DENY_ALL' },
          },
        },
      });
    }

    const encrypted = await this.prisma.provider.findMany({
      where: { apiKeyEnc: { not: null } },
      select: { apiKeyEnc: true },
    });
    for (const provider of encrypted) this.cipher.decrypt(provider.apiKeyEnc!);
  }

  async list() {
    const providers = await this.prisma.provider.findMany({
      select: {
        id: true,
        key: true,
        type: true,
        displayName: true,
        baseUrl: true,
        apiKeyEnc: true,
        apiKeyHint: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { displayName: 'asc' },
    });
    return providers.map(({ apiKeyEnc, ...provider }) => ({
      ...provider,
      hasApiKey: Boolean(apiKeyEnc),
    }));
  }

  async create(body: CreateProviderDto) {
    const credential = this.credentialFields(body.credential);
    const baseUrl = body.baseUrl.trim();
    this.validate(
      'OPENAI_COMPATIBLE',
      body.enabled ?? false,
      baseUrl,
      credential.apiKeyEnc ?? null,
    );
    const created = await this.prisma.provider.create({
      data: {
        key: `custom-${randomUUID()}`,
        type: 'OPENAI_COMPATIBLE',
        displayName: body.displayName.trim(),
        baseUrl,
        enabled: body.enabled ?? false,
        ...credential,
        modelPolicy: { create: { mode: 'ALLOW_ALL' } },
      },
    });
    return this.safeById(created.id);
  }

  async update(id: string, body: UpdateProviderDto) {
    const current = await this.prisma.provider.findUnique({ where: { id } });
    if (!current)
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: 'Provider was not found.',
      });
    const credential = this.credentialFields(body.credential);
    const baseUrl = body.baseUrl?.trim() ?? current.baseUrl;
    const enabled = body.enabled ?? current.enabled;
    const effectiveCredential =
      credential.apiKeyEnc === undefined
        ? current.apiKeyEnc
        : credential.apiKeyEnc;
    this.validate(current.type, enabled, baseUrl, effectiveCredential);
    await this.prisma.provider.update({
      where: { id },
      data: {
        displayName: body.displayName?.trim(),
        baseUrl,
        enabled,
        ...credential,
      },
    });
    return this.safeById(id);
  }

  private credentialFields(update?: CredentialUpdateDto): {
    apiKeyEnc?: string | null;
    apiKeyHint?: string | null;
  } {
    if (!update || update.mode === 'KEEP') return {};
    if (update.mode === 'REMOVE') return { apiKeyEnc: null, apiKeyHint: null };
    const value = update.value?.trim();
    if (!value)
      throw new BadRequestException({
        code: 'PROVIDER_CREDENTIAL_REQUIRED',
        message: 'Replacement credential is required.',
      });
    try {
      return {
        apiKeyEnc: this.cipher.encrypt(value),
        apiKeyHint: safeHint(value),
      };
    } catch (error) {
      if (error instanceof ProviderEncryptionUnavailableError)
        throw new ServiceUnavailableException({
          code: 'PROVIDER_ENCRYPTION_UNAVAILABLE',
          message: 'Provider credential encryption is unavailable.',
        });
      throw error;
    }
  }

  private validate(
    type: ProviderType,
    enabled: boolean,
    baseUrl: string | null,
    changedCredential: string | null | undefined,
  ): void {
    if (!enabled) return;
    if (!baseUrl)
      throw new BadRequestException({
        code: 'PROVIDER_BASE_URL_REQUIRED',
        message: 'Enabled provider requires a base URL.',
      });
    if (
      (type === 'OPENAI' || type === 'OPENROUTER') &&
      changedCredential === null
    )
      throw new BadRequestException({
        code: 'PROVIDER_CREDENTIAL_REQUIRED',
        message: 'Enabled provider requires an API key.',
      });
  }

  private async safeById(id: string) {
    const provider = await this.prisma.provider.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        key: true,
        type: true,
        displayName: true,
        baseUrl: true,
        apiKeyEnc: true,
        apiKeyHint: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const { apiKeyEnc, ...safe } = provider;
    return { ...safe, hasApiKey: Boolean(apiKeyEnc) };
  }

  async runtimeById(id: string): Promise<RuntimeProviderConfig> {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    if (!provider)
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: 'Provider was not found.',
      });
    return this.runtimeConfig(provider);
  }

  async runtimeByKey(key: string): Promise<RuntimeProviderConfig> {
    const provider = await this.prisma.provider.findUnique({ where: { key } });
    if (!provider)
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: 'Provider was not found.',
      });
    return this.runtimeConfig(provider);
  }

  async enabledRuntimeProviders(): Promise<RuntimeProviderConfig[]> {
    const providers = await this.prisma.provider.findMany({
      where: { enabled: true },
      orderBy: { displayName: 'asc' },
    });
    return providers.map((provider) => this.runtimeConfig(provider));
  }

  private runtimeConfig(provider: {
    id: string;
    key: string;
    type: ProviderType;
    displayName: string;
    baseUrl: string | null;
    enabled: boolean;
    apiKeyEnc: string | null;
  }): RuntimeProviderConfig {
    if (!provider.baseUrl)
      throw new BadRequestException({
        code: 'PROVIDER_BASE_URL_REQUIRED',
        message: 'Provider requires a base URL.',
      });
    return {
      id: provider.id,
      key: provider.key,
      type: provider.type,
      displayName: provider.displayName,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      apiKey: provider.apiKeyEnc
        ? this.cipher.decrypt(provider.apiKeyEnc)
        : undefined,
    };
  }
}
