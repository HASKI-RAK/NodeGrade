import { PrismaService } from '../prisma.service.js';
import { RETENTION_DAYS, RetentionService } from './retention.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-15T12:00:00.000Z');
const CUTOFF = new Date(NOW.getTime() - RETENTION_DAYS * DAY_MS);

describe('RetentionService', () => {
  const build = () => {
    const workspace = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    const adminSession = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const service = new RetentionService({
      workspace,
      adminSession,
    } as unknown as PrismaService);
    return { service, workspace, adminSession };
  };

  it('deletes browser workspaces idle past the retention window (FR-009)', async () => {
    const { service, workspace } = build();

    await service.sweep(NOW);

    expect(workspace.deleteMany).toHaveBeenCalledWith({
      where: { type: 'BROWSER', lastActiveAt: { lt: CUTOFF } },
    });
  });

  it('requires a workshop workspace to be both idle and ended', async () => {
    const { service, workspace } = build();

    await service.sweep(NOW);

    const where = workspace.deleteMany.mock.calls[1][0].where;
    expect(where.type).toBe('WORKSHOP');
    expect(where.lastActiveAt).toEqual({ lt: CUTOFF });
    // max(lastActiveAt, closedAt ?? expiresAt) + 60d, which is what reconciles FR-009a
    // with AC-006a: activity alone is never enough to expire a workshop workspace.
    expect(where.workshop.OR).toEqual(
      expect.arrayContaining([
        { status: 'CLOSED', closedAt: { lt: CUTOFF } },
        { expiresAt: { lt: CUTOFF } },
      ]),
    );
  });

  it('never deletes LTI workspaces (FR-009b)', async () => {
    const { service, workspace } = build();

    await service.sweep(NOW);

    for (const call of workspace.deleteMany.mock.calls) {
      expect(call[0].where.type).not.toBe('LTI');
    }
    expect(workspace.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('folds in expired admin sessions', async () => {
    const { service, adminSession } = build();

    await service.sweep(NOW);

    expect(adminSession.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: NOW } },
    });
  });

  it('reports what it removed', async () => {
    const { service, workspace, adminSession } = build();
    workspace.deleteMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 });
    adminSession.deleteMany.mockResolvedValue({ count: 7 });

    await expect(service.sweep(NOW)).resolves.toEqual({
      browserWorkspaces: 3,
      workshopWorkspaces: 2,
      adminSessions: 7,
    });
  });

  it('does not schedule a sweep when retention is disabled', () => {
    const { service, workspace } = build();
    const previous = process.env.RETENTION_ENABLED;
    process.env.RETENTION_ENABLED = 'false';

    try {
      service.onApplicationBootstrap();
      expect(workspace.deleteMany).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.RETENTION_ENABLED;
      else process.env.RETENTION_ENABLED = previous;
      service.onModuleDestroy();
    }
  });
});
