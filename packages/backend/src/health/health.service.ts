import { Injectable } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { PrismaService } from '../prisma.service';

type ComponentStatus = 'up' | 'down';

type OverallStatus = 'ok' | 'degraded';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const startedAt = performance.now();

    const dbStatus = await this.checkDatabase();

    const result = {
      status:
        dbStatus.status === 'up'
          ? ('ok' as OverallStatus)
          : ('degraded' as OverallStatus),
      service: 'nodegrade-backend',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV ?? 'development',
      uptimeSeconds: Math.round(process.uptime()),
      availabilityTarget: '>=99% during lecture and exam periods',
      requirements: ['HASKI-REQ-0030'],
      components: {
        database: dbStatus,
      },
      durations: {
        totalMs: Math.round(performance.now() - startedAt),
      },
    };

    return result;
  }

  private async checkDatabase(): Promise<{
    status: ComponentStatus;
    latencyMs: number | null;
  }> {
    const startedAt = performance.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch {
      return {
        status: 'down',
        latencyMs: null,
      };
    }
  }
}
