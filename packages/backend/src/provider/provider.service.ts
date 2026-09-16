import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
  PROVIDER_KEY_LOCAL,
  PROVIDER_KEY_OPENAI,
  PROVIDER_KEY_OPENROUTER,
} from '@haski/ta-lib';
import { PrismaService } from '../prisma.service.js';

const PROVIDERS = [
  {
    key: PROVIDER_KEY_LOCAL,
    type: 'MODEL_WORKER' as const,
    displayName: 'Local model worker',
    enabled: true,
    baseUrl: null,
  },
  {
    key: PROVIDER_KEY_OPENAI,
    type: 'OPENAI' as const,
    displayName: 'OpenAI',
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    key: PROVIDER_KEY_OPENROUTER,
    type: 'OPENROUTER' as const,
    displayName: 'OpenRouter',
    enabled: false,
    baseUrl: 'https://openrouter.ai/api/v1',
  },
];

@Injectable()
export class ProviderService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const provider of PROVIDERS) {
      await this.prisma.provider.upsert({
        where: { key: provider.key },
        update: {},
        create: {
          ...provider,
          modelPolicy: {
            create: {
              mode: provider.enabled ? 'ALLOW_ALL' : 'DENY_ALL',
            },
          },
        },
      });
    }
  }

  async list() {
    return this.prisma.provider.findMany({
      select: {
        id: true,
        key: true,
        type: true,
        displayName: true,
        baseUrl: true,
        apiKeyHint: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        modelPolicy: {
          select: { mode: true, allowedModels: true, updatedAt: true },
        },
      },
      orderBy: { displayName: 'asc' },
    });
  }
}
