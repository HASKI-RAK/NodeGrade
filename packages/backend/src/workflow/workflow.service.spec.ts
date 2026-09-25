import { PrismaService } from '../prisma.service.js';
import { TemplateService } from '../template/template.service.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import type { WorkflowHistoryService } from './workflow-history.service.js';
import { WorkflowService } from './workflow.service.js';

const revision = (overrides: Record<string, unknown> = {}) => ({
  id: 'rev-1',
  templateId: 'tpl-1',
  revision: 1,
  name: 'Demo workflow',
  content: '{"nodes":[{"id":1,"type":"input/answer"}]}',
  contentSchema: 2,
  ...overrides,
});

const workspaceA: ResolvedWorkspace = {
  id: 'ws-a',
  type: 'BROWSER',
  label: null,
  workshopId: null,
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'wf-1',
  name: 'Rubric assessment',
  slug: 'rubric-assessment',
  version: 1,
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  updatedAt: new Date('2026-09-15T10:00:00.000Z'),
  publishedVersion: null,
  publishedAt: null,
  sourceTemplateId: null,
  sourceTemplateRevisionId: null,
  content: '{"nodes":[]}',
  ...overrides,
});

describe('WorkflowService', () => {
  const build = () => {
    const workflow = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(row()),
      create: jest.fn().mockResolvedValue(row()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    };
    const templates = {
      findBySlug: jest.fn().mockResolvedValue({ id: 'tpl-1' }),
      getCurrentRevision: jest.fn().mockResolvedValue(revision()),
      getRevision: jest.fn().mockResolvedValue(revision()),
    };
    const history = {
      isDue: jest.fn().mockResolvedValue(true),
      capture: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowService(
      { workflow } as unknown as PrismaService,
      templates as unknown as TemplateService,
      history as unknown as WorkflowHistoryService,
    );
    return { service, workflow, templates, history };
  };

  describe('list', () => {
    it('scopes to the workspace and leaves content out (AC-002)', async () => {
      const { service, workflow } = build();

      await service.list(workspaceA.id);

      const args = workflow.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ workspaceId: 'ws-a' });
      expect(args.select).not.toHaveProperty('content');
    });
  });

  describe('get', () => {
    it('carries the workspace in the query, never the id alone (AC-008)', async () => {
      const { service, workflow } = build();

      await service.get(workspaceA.id, 'wf-1');

      expect(workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'wf-1', workspaceId: 'ws-a' } }),
      );
    });

    it('reports another workspace’s workflow as missing, not forbidden', async () => {
      const { service, workflow } = build();
      workflow.findFirst.mockResolvedValue(null);

      await expect(service.get(workspaceA.id, 'wf-other')).rejects.toMatchObject(
        { status: 404 },
      );
    });
  });

  describe('create', () => {
    it('derives a slug from the name', async () => {
      const { service, workflow } = build();

      await service.create(workspaceA, {
        name: 'Rubric Assessment',
        content: '{}',
      });

      expect(workflow.create.mock.calls[0][0].data).toMatchObject({
        workspaceId: 'ws-a',
        name: 'Rubric Assessment',
        slug: 'rubric-assessment',
      });
    });

    it('lets two workspaces hold the same slug (AC-001)', async () => {
      const { service, workflow } = build();
      // Nothing taken in this workspace, even though another workspace uses the slug.
      workflow.findMany.mockResolvedValue([]);

      await service.create(workspaceA, { name: 'Rubric', content: '{}' });

      expect(workflow.create.mock.calls[0][0].data.slug).toBe('rubric');
      expect(workflow.findMany.mock.calls[0][0].where.workspaceId).toBe('ws-a');
    });

    it('numbers a duplicate name within the workspace', async () => {
      const { service, workflow } = build();
      workflow.findMany.mockResolvedValue([{ slug: 'rubric' }]);

      await service.create(workspaceA, { name: 'Rubric', content: '{}' });

      expect(workflow.create.mock.calls[0][0].data.slug).toBe('rubric-2');
    });

    it('retries when it loses the slug race to the unique constraint', async () => {
      const { service, workflow } = build();
      workflow.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ slug: 'rubric' }]);
      workflow.create
        .mockRejectedValueOnce(Object.assign(new Error('unique'), {
          code: 'P2002',
        }))
        .mockResolvedValueOnce(row({ slug: 'rubric-2' }));

      const created = await service.create(workspaceA, {
        name: 'Rubric',
        content: '{}',
      });

      expect(created.slug).toBe('rubric-2');
      expect(workflow.create).toHaveBeenCalledTimes(2);
    });

    it('does not swallow an unrelated database error', async () => {
      const { service, workflow } = build();
      workflow.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.create(workspaceA, { name: 'Rubric', content: '{}' }),
      ).rejects.toThrow('connection lost');
    });

    it('caps how many workflows a participant workspace may hold (E3)', async () => {
      const { service, workflow } = build();
      workflow.count.mockResolvedValue(50);

      await expect(
        service.create(workspaceA, { name: 'One more', content: '{}' }),
      ).rejects.toMatchObject({ status: 403 });
      expect(workflow.create).not.toHaveBeenCalled();
    });

    it('exempts LTI workspaces from the cap', async () => {
      const { service, workflow } = build();
      workflow.count.mockResolvedValue(500);

      await service.create(
        { ...workspaceA, type: 'LTI' },
        { name: 'Course workflow', content: '{}' },
      );

      expect(workflow.count).not.toHaveBeenCalled();
      expect(workflow.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('makes the expected version part of the write (AC-006b)', async () => {
      const { service, workflow } = build();

      await service.update(
        workspaceA.id,
        'wf-1',
        { kind: 'versions', versions: [4] },
        { content: '{"nodes":[1]}' },
      );

      expect(workflow.updateMany).toHaveBeenCalledWith({
        where: { id: 'wf-1', workspaceId: 'ws-a', version: { in: [4] } },
        data: { version: { increment: 1 }, content: '{"nodes":[1]}' },
      });
    });

    it('rejects a stale save with the current version (FR-013)', async () => {
      const { service, workflow } = build();
      workflow.updateMany.mockResolvedValue({ count: 0 });
      workflow.findFirst.mockResolvedValue({ version: 5 });

      await expect(
        service.update(
          workspaceA.id,
          'wf-1',
          { kind: 'versions', versions: [4] },
          { content: 'stale' },
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'version_conflict', currentVersion: 5 },
      });
    });

    it('does not overwrite the stored state when the version is stale', async () => {
      const { service, workflow } = build();
      workflow.updateMany.mockResolvedValue({ count: 0 });
      workflow.findFirst.mockResolvedValue({ version: 5 });

      await service
        .update(
          workspaceA.id,
          'wf-1',
          { kind: 'versions', versions: [4] },
          { content: 'stale' },
        )
        .catch(() => undefined);

      expect(workflow.updateMany).toHaveBeenCalledTimes(1);
    });

    it('distinguishes a missing workflow from a conflict', async () => {
      const { service, workflow } = build();
      workflow.updateMany.mockResolvedValue({ count: 0 });
      workflow.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          workspaceA.id,
          'wf-1',
          { kind: 'versions', versions: [4] },
          { content: 'x' },
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('drops the version filter for If-Match: *', async () => {
      const { service, workflow } = build();

      await service.update(
        workspaceA.id,
        'wf-1',
        { kind: 'any' },
        { content: 'x' },
      );

      expect(workflow.updateMany.mock.calls[0][0].where).toEqual({
        id: 'wf-1',
        workspaceId: 'ws-a',
      });
    });

    it('never writes outside the caller’s workspace (AC-004)', async () => {
      const { service, workflow } = build();

      await service.update(
        workspaceA.id,
        'wf-1',
        { kind: 'versions', versions: [1] },
        { name: 'Renamed' },
      );

      expect(workflow.updateMany.mock.calls[0][0].where.workspaceId).toBe(
        'ws-a',
      );
    });

    it('captures the state the save replaces (SPEC-0021/AC-001)', async () => {
      const { service, workflow, history } = build();
      workflow.findFirst.mockResolvedValue(
        row({ version: 4, content: '{"nodes":[{"id":1}]}' }),
      );

      await service.update(
        workspaceA.id,
        'wf-1',
        { kind: 'versions', versions: [4] },
        { content: '{"nodes":[]}' },
      );

      expect(history.capture).toHaveBeenCalledWith(
        'wf-1',
        expect.objectContaining({ version: 4, content: '{"nodes":[{"id":1}]}' }),
      );
    });

    it('reads the old content only when a checkpoint is due', async () => {
      const { service, workflow, history } = build();
      history.isDue.mockResolvedValue(false);

      await service.update(
        workspaceA.id,
        'wf-1',
        { kind: 'versions', versions: [1] },
        { content: '{"nodes":[]}' },
      );

      // Only the closing summary read, which never carries content.
      expect(
        workflow.findFirst.mock.calls.filter(
          (call) => call[0].select.content === true,
        ),
      ).toHaveLength(0);
      expect(history.capture).not.toHaveBeenCalled();
    });

    it('captures nothing when the save was rejected as stale', async () => {
      const { service, workflow, history } = build();
      workflow.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(
          workspaceA.id,
          'wf-1',
          { kind: 'versions', versions: [1] },
          { content: '{"nodes":[]}' },
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(history.capture).not.toHaveBeenCalled();
    });

    it('does not snapshot a rename, which changes no graph', async () => {
      const { service, history } = build();

      await service.update(
        workspaceA.id,
        'wf-1',
        { kind: 'versions', versions: [1] },
        { name: 'Renamed' },
      );

      expect(history.capture).not.toHaveBeenCalled();
    });
  });

  describe('createFromTemplateSlug', () => {
    it('records the source template and revision (AC-001, FR-018)', async () => {
      const { service, workflow } = build();

      await service.createFromTemplateSlug(workspaceA, 'demo-workflow');

      expect(workflow.create.mock.calls[0][0].data).toMatchObject({
        workspaceId: 'ws-a',
        name: 'Demo workflow',
        content: '{"nodes":[{"id":1,"type":"input/answer"}]}',
        sourceTemplateId: 'tpl-1',
        sourceTemplateRevisionId: 'rev-1',
      });
    });

    it('only resolves published templates (FR-017)', async () => {
      const { service, templates } = build();

      await service.createFromTemplateSlug(workspaceA, 'demo-workflow');

      expect(templates.findBySlug).toHaveBeenCalledWith('demo-workflow', true);
    });

    it('lets the caller name their copy', async () => {
      const { service, workflow } = build();

      await service.createFromTemplateSlug(workspaceA, 'demo', 'My attempt');

      expect(workflow.create.mock.calls[0][0].data.name).toBe('My attempt');
    });

    it('carries the revision’s content schema so migrations still see it', async () => {
      const { service, workflow, templates } = build();
      templates.getCurrentRevision.mockResolvedValue(
        revision({ contentSchema: 1 }),
      );

      await service.createFromTemplateSlug(workspaceA, 'demo');

      expect(workflow.create.mock.calls[0][0].data.contentSchema).toBe(1);
    });

    it('never writes to the template (FR-007)', async () => {
      const { service, templates } = build();

      await service.createFromTemplateSlug(workspaceA, 'demo');

      // The service is read-only against templates by construction: it holds no write
      // method for them at all.
      expect(Object.keys(templates)).toEqual([
        'findBySlug',
        'getCurrentRevision',
        'getRevision',
      ]);
    });

    it('is still subject to the workspace cap', async () => {
      const { service, workflow } = build();
      workflow.count.mockResolvedValue(50);

      await expect(
        service.createFromTemplateSlug(workspaceA, 'demo'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('reset', () => {
    it('restores the revision the workflow came from, not the current one (AC-002)', async () => {
      const { service, workflow, templates } = build();
      workflow.findFirst
        .mockResolvedValueOnce({ sourceTemplateRevisionId: 'rev-1' })
        .mockResolvedValueOnce(row());
      templates.getRevision.mockResolvedValue(
        revision({ content: 'revision-1-content' }),
      );

      await service.reset(workspaceA.id, 'wf-1');

      expect(templates.getRevision).toHaveBeenCalledWith('rev-1');
      expect(workflow.updateMany).toHaveBeenCalledWith({
        where: { id: 'wf-1', workspaceId: 'ws-a' },
        data: {
          content: 'revision-1-content',
          contentSchema: 2,
          version: { increment: 1 },
        },
      });
    });

    it('bumps the version so another tab conflicts instead of clobbering', async () => {
      const { service, workflow } = build();
      workflow.findFirst
        .mockResolvedValueOnce({ sourceTemplateRevisionId: 'rev-1' })
        .mockResolvedValueOnce(row());

      await service.reset(workspaceA.id, 'wf-1');

      expect(workflow.updateMany.mock.calls[0][0].data.version).toEqual({
        increment: 1,
      });
    });

    it('keeps the discarded edits in history, due or not (SPEC-0021/AC-002)', async () => {
      const { service, workflow, history } = build();
      history.isDue.mockResolvedValue(false);
      workflow.findFirst
        .mockResolvedValueOnce({
          sourceTemplateRevisionId: 'rev-1',
          version: 7,
          name: 'Rubric assessment',
          content: 'edited-content',
          contentSchema: 2,
        })
        .mockResolvedValueOnce(row());

      await service.reset(workspaceA.id, 'wf-1');

      expect(history.capture).toHaveBeenCalledWith(
        'wf-1',
        expect.objectContaining({ version: 7, content: 'edited-content' }),
        'reset',
      );
    });

    it('refuses a workflow that has no source template', async () => {
      const { service, workflow } = build();
      workflow.findFirst.mockResolvedValue({
        sourceTemplateRevisionId: null,
      });

      await expect(service.reset(workspaceA.id, 'wf-1')).rejects.toMatchObject({
        status: 409,
        response: { code: 'workflow_has_no_template' },
      });
      expect(workflow.updateMany).not.toHaveBeenCalled();
    });

    it('is workspace-scoped', async () => {
      const { service, workflow } = build();
      workflow.findFirst.mockResolvedValue(null);

      await expect(
        service.reset(workspaceA.id, 'wf-other'),
      ).rejects.toMatchObject({ status: 404 });
      expect(workflow.findFirst.mock.calls[0][0].where).toEqual({
        id: 'wf-other',
        workspaceId: 'ws-a',
      });
    });
  });

  describe('remove', () => {
    it('is scoped, and reports a foreign id as missing (AC-008)', async () => {
      const { service, workflow } = build();
      workflow.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove(workspaceA.id, 'wf-other'),
      ).rejects.toMatchObject({ status: 404 });
      expect(workflow.deleteMany).toHaveBeenCalledWith({
        where: { id: 'wf-other', workspaceId: 'ws-a' },
      });
    });
  });

  describe('publish', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');

    it('snapshots the content that was read, at the version it was read at', async () => {
      const { service, workflow } = build();
      workflow.findFirst
        .mockResolvedValueOnce({ content: 'published-body', version: 3 })
        .mockResolvedValueOnce(row({ publishedVersion: 3, publishedAt: now }));

      await service.publish(workspaceA.id, 'wf-1', now);

      expect(workflow.updateMany).toHaveBeenCalledWith({
        where: { id: 'wf-1', workspaceId: 'ws-a', version: 3 },
        data: {
          publishedContent: 'published-body',
          publishedVersion: 3,
          publishedAt: now,
        },
      });
    });

    it('leaves version untouched so the open editor keeps its ETag', async () => {
      const { service, workflow } = build();
      workflow.findFirst
        .mockResolvedValueOnce({ content: 'body', version: 3 })
        .mockResolvedValueOnce(row({ version: 3 }));

      await service.publish(workspaceA.id, 'wf-1', now);

      expect(workflow.updateMany.mock.calls[0][0].data).not.toHaveProperty(
        'version',
      );
    });

    it('fails rather than publishing a mix of two saves', async () => {
      const { service, workflow } = build();
      workflow.findFirst.mockResolvedValue({ content: 'body', version: 3 });
      workflow.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.publish(workspaceA.id, 'wf-1', now),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'version_conflict' },
      });
    });
  });
});
