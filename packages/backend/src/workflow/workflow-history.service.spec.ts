import { PrismaService } from '../prisma.service.js';
import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_SNAPSHOT_INTERVAL_MS,
  WorkflowHistoryService,
} from './workflow-history.service.js';

const now = new Date('2026-09-22T12:00:00.000Z');
const minutesBefore = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000);

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: 'ver-1',
  version: 3,
  name: 'Rubric assessment',
  reason: 'save',
  nodeCount: 4,
  createdAt: minutesBefore(10),
  ...overrides,
});

describe('WorkflowHistoryService', () => {
  const build = () => {
    const workflowVersion = {
      findFirst: jest.fn().mockResolvedValue(snapshot()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(snapshot()),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const workflow = {
      findFirst: jest.fn().mockResolvedValue({ id: 'wf-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const service = new WorkflowHistoryService({
      workflowVersion,
      workflow,
    } as unknown as PrismaService);
    return { service, workflowVersion, workflow };
  };

  describe('isDue', () => {
    it('is due for a workflow that has never been captured', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.findFirst.mockResolvedValue(null);

      await expect(service.isDue('wf-1', now)).resolves.toBe(true);
    });

    it('coalesces the autosaves inside one window (AC-001)', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.findFirst.mockResolvedValue({
        createdAt: new Date(now.getTime() - DEFAULT_SNAPSHOT_INTERVAL_MS + 1000),
      });

      await expect(service.isDue('wf-1', now)).resolves.toBe(false);
    });

    it('is due again once the window has passed', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.findFirst.mockResolvedValue({
        createdAt: new Date(now.getTime() - DEFAULT_SNAPSHOT_INTERVAL_MS),
      });

      await expect(service.isDue('wf-1', now)).resolves.toBe(true);
    });
  });

  describe('capture', () => {
    it('stores the state with the node count the list shows', async () => {
      const { service, workflowVersion } = build();

      await service.capture('wf-1', {
        version: 6,
        name: 'Rubric assessment',
        content: '{"nodes":[{"id":1},{"id":2}]}',
        contentSchema: 2,
      });

      expect(workflowVersion.create.mock.calls[0][0].data).toMatchObject({
        workflowId: 'wf-1',
        version: 6,
        nodeCount: 2,
        reason: 'save',
      });
    });

    it('keeps unparseable content rather than losing it', async () => {
      const { service, workflowVersion } = build();

      await service.capture('wf-1', {
        version: 6,
        name: 'Broken',
        content: 'not json',
        contentSchema: 2,
      });

      expect(workflowVersion.create.mock.calls[0][0].data).toMatchObject({
        content: 'not json',
        nodeCount: 0,
      });
    });

    it('trims the history to the newest rows (AC-005)', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.findMany.mockResolvedValue([{ id: 'old-1' }]);

      await service.capture('wf-1', {
        version: 6,
        name: 'Rubric assessment',
        content: '{"nodes":[]}',
        contentSchema: 2,
      });

      expect(workflowVersion.findMany.mock.calls[0][0].skip).toBe(
        DEFAULT_HISTORY_LIMIT,
      );
      expect(workflowVersion.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1'] }, workflowId: 'wf-1' },
      });
    });

    it('never fails the write it was protecting (NFR-001)', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.create.mockRejectedValue(new Error('disk full'));

      await expect(
        service.capture('wf-1', {
          version: 6,
          name: 'Rubric assessment',
          content: '{"nodes":[]}',
          contentSchema: 2,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('reports a workflow in another workspace as missing (AC-006)', async () => {
      const { service, workflow } = build();
      workflow.findFirst.mockResolvedValue(null);

      await expect(service.list('ws-a', 'wf-other')).rejects.toMatchObject({
        status: 404,
        response: { code: 'workflow_not_found' },
      });
    });

    it('lists newest first and leaves content out', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.findMany.mockResolvedValue([snapshot()]);

      const versions = await service.list('ws-a', 'wf-1');

      const args = workflowVersion.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
      expect(args.select).not.toHaveProperty('content');
      expect(versions[0]).toMatchObject({ id: 'ver-1', reason: 'save' });
    });
  });

  describe('restore', () => {
    it('captures the live state before overwriting it (AC-003)', async () => {
      const { service, workflowVersion, workflow } = build();
      workflowVersion.findFirst.mockResolvedValue({
        version: 2,
        content: 'old-content',
        contentSchema: 2,
      });
      workflow.findFirst.mockResolvedValue({
        version: 9,
        name: 'Rubric assessment',
        content: 'live-content',
        contentSchema: 2,
      });

      await service.restore('ws-a', 'wf-1', 'ver-1');

      expect(workflowVersion.create.mock.calls[0][0].data).toMatchObject({
        version: 9,
        content: 'live-content',
        reason: 'restore',
      });
      expect(workflow.updateMany).toHaveBeenCalledWith({
        where: { id: 'wf-1', workspaceId: 'ws-a' },
        data: {
          content: 'old-content',
          contentSchema: 2,
          version: { increment: 1 },
        },
      });
    });

    it('carries the workspace into the version lookup (AC-006)', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.restore('ws-a', 'wf-1', 'ver-foreign'),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'workflow_version_not_found' },
      });
      expect(workflowVersion.findFirst.mock.calls[0][0].where).toEqual({
        id: 'ver-foreign',
        workflowId: 'wf-1',
        workflow: { workspaceId: 'ws-a' },
      });
    });

    it('does not write the old graph back when the workflow is gone', async () => {
      const { service, workflowVersion, workflow } = build();
      workflowVersion.findFirst.mockResolvedValue({
        version: 2,
        content: 'old-content',
        contentSchema: 2,
      });
      workflow.findFirst.mockResolvedValue(null);

      await expect(
        service.restore('ws-a', 'wf-1', 'ver-1'),
      ).rejects.toMatchObject({ status: 404 });
      expect(workflow.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes only within the caller’s workspace (AC-004, AC-006)', async () => {
      const { service, workflowVersion } = build();

      await service.remove('ws-a', 'wf-1', 'ver-1');

      expect(workflowVersion.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'ver-1',
          workflowId: 'wf-1',
          workflow: { workspaceId: 'ws-a' },
        },
      });
    });

    it('reports a foreign version id as missing', async () => {
      const { service, workflowVersion } = build();
      workflowVersion.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove('ws-a', 'wf-1', 'ver-foreign'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('clear', () => {
    it('drops the stored states and leaves the workflow alone (AC-004)', async () => {
      const { service, workflowVersion, workflow } = build();

      await service.clear('ws-a', 'wf-1');

      expect(workflowVersion.deleteMany).toHaveBeenCalledWith({
        where: { workflowId: 'wf-1' },
      });
      expect(workflow.updateMany).not.toHaveBeenCalled();
    });
  });
});
