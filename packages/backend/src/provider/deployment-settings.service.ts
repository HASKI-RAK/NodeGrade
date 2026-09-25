import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type { ModelRef } from '@haski/ta-lib';
import { PrismaService } from '../prisma.service.js';
import type { DeploymentSettingsDto } from './dto/provider.dto.js';
import { permitsModel } from './model-policy.js';
import { ProviderService } from './provider.service.js';

/** One row governs the whole deployment, so its primary key is a constant. */
export const DEPLOYMENT_SETTINGS_ID = 'singleton';

const CACHE_TTL_MS = 5_000;

export type DeploymentSettings = {
  defaultModel: ModelRef | null;
};

@Injectable()
export class DeploymentSettingsService implements OnApplicationBootstrap {
  private cached?: { expiresAt: number; value: DeploymentSettings };

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.deploymentSettings.upsert({
      where: { id: DEPLOYMENT_SETTINGS_ID },
      create: { id: DEPLOYMENT_SETTINGS_ID },
      update: {},
    });
  }

  /**
   * Cached briefly so a burst of runs does not turn the fallback into a database
   * amplifier, and re-read often enough that a saved default applies without a
   * restart. Stored content stays untouched: the default is substituted at
   * execution time, never persisted into workflows.
   */
  async get(): Promise<DeploymentSettings> {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.value;
    const stored = await this.prisma.deploymentSettings.findUnique({
      where: { id: DEPLOYMENT_SETTINGS_ID },
      select: { defaultProviderKey: true, defaultModelId: true },
    });
    const value: DeploymentSettings =
      stored?.defaultProviderKey && stored.defaultModelId
        ? {
            defaultModel: {
              providerKey: stored.defaultProviderKey,
              modelId: stored.defaultModelId,
            },
          }
        : { defaultModel: null };
    this.cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }

  /**
   * Saves the deployment default. Both halves clear together; a half-set default is
   * rejected rather than stored. The provider must exist, be enabled, and permit the
   * model — reachability is checked at execution and readiness time instead, so a
   * momentarily unreachable provider does not block saving.
   */
  async update(body: DeploymentSettingsDto): Promise<DeploymentSettings> {
    const providerKey = body.providerKey ?? null;
    const modelId = body.modelId ?? null;
    if (providerKey === null || modelId === null) {
      if (providerKey !== null || modelId !== null)
        throw new BadRequestException({
          code: 'DEFAULT_MODEL_INCOMPLETE',
          message:
            'Default provider and model must be set together or cleared together.',
        });
      await this.prisma.deploymentSettings.upsert({
        where: { id: DEPLOYMENT_SETTINGS_ID },
        create: { id: DEPLOYMENT_SETTINGS_ID },
        update: { defaultProviderKey: null, defaultModelId: null },
      });
      this.cached = undefined;
      return { defaultModel: null };
    }
    let provider: Awaited<ReturnType<ProviderService['runtimeByKey']>>;
    try {
      provider = await this.providers.runtimeByKey(providerKey);
    } catch (error) {
      if (error instanceof NotFoundException)
        throw new BadRequestException({
          code: 'DEFAULT_MODEL_UNKNOWN_PROVIDER',
          message: 'The default provider does not exist.',
        });
      throw error;
    }
    if (!provider.enabled)
      throw new BadRequestException({
        code: 'DEFAULT_MODEL_PROVIDER_DISABLED',
        message: 'The default provider must be enabled.',
      });
    if (!permitsModel(provider.policy, modelId))
      throw new BadRequestException({
        code: 'DEFAULT_MODEL_NOT_PERMITTED',
        message: 'The default model is not permitted by its provider policy.',
      });
    await this.prisma.deploymentSettings.upsert({
      where: { id: DEPLOYMENT_SETTINGS_ID },
      create: {
        id: DEPLOYMENT_SETTINGS_ID,
        defaultProviderKey: providerKey,
        defaultModelId: modelId,
      },
      update: { defaultProviderKey: providerKey, defaultModelId: modelId },
    });
    const value: DeploymentSettings = {
      defaultModel: { providerKey, modelId },
    };
    this.cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }
}
