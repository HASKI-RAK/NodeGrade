import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { ExecutionLimitsDto } from './dto/provider.dto.js';

/** One row governs the whole deployment, so its primary key is a constant. */
export const EXECUTION_LIMITS_ID = 'singleton';

/**
 * Conservative enough for a 20–50 participant workshop sharing one provider key: two
 * runs in flight per workspace, eight provider requests across the deployment.
 */
export const DEFAULT_EXECUTION_LIMITS = {
  workspaceConcurrentRuns: 2,
  providerConcurrentRequests: 8,
};

export type ExecutionLimits = typeof DEFAULT_EXECUTION_LIMITS;

const CACHE_TTL_MS = 5_000;

@Injectable()
export class ExecutionLimitsService implements OnApplicationBootstrap {
  private cached?: { expiresAt: number; value: ExecutionLimits };

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.executionLimits.upsert({
      where: { id: EXECUTION_LIMITS_ID },
      create: { id: EXECUTION_LIMITS_ID, ...DEFAULT_EXECUTION_LIMITS },
      update: {},
    });
  }

  /**
   * Cached briefly so a burst of runs does not turn the guard into a database
   * amplifier, and re-read often enough that a saved limit applies without a restart
   * (SPEC-0012/FR-012).
   */
  async get(): Promise<ExecutionLimits> {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.value;
    const stored = await this.prisma.executionLimits.findUnique({
      where: { id: EXECUTION_LIMITS_ID },
      select: {
        workspaceConcurrentRuns: true,
        providerConcurrentRequests: true,
      },
    });
    const value = stored ?? DEFAULT_EXECUTION_LIMITS;
    this.cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }

  async update(body: ExecutionLimitsDto): Promise<ExecutionLimits> {
    const value = {
      workspaceConcurrentRuns: body.workspaceConcurrentRuns,
      providerConcurrentRequests: body.providerConcurrentRequests,
    };
    await this.prisma.executionLimits.upsert({
      where: { id: EXECUTION_LIMITS_ID },
      create: { id: EXECUTION_LIMITS_ID, ...value },
      update: value,
    });
    this.cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  }
}
