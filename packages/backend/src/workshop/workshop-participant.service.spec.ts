import type { PrismaService } from '../prisma.service.js';
import type { WorkflowService } from '../workflow/workflow.service.js';
import type {
  ResolvedWorkspace,
  WorkspaceService,
} from '../workspace/workspace.service.js';
import type { EntryRow } from './workshop-entries.js';
import { WorkshopParticipantService } from './workshop-participant.service.js';
import type { WorkshopReadinessService } from './workshop-readiness.service.js';
import type { WorkshopService } from './workshop.service.js';

const TOKEN = `ngw_${'a'.repeat(43)}`;
const NOW = new Date('2026-09-25T10:00:00.000Z');

const entry = (id: string, templateId = `tpl-${id}`): EntryRow => ({
  id,
  position: 0,
  templateId,
  templateRevisionId: `rev-${id}`,
  template: {
    id: templateId,
    slug: `slug-${id}`,
    kind: 'WORKFLOW',
    name: `Exercise ${id}`,
    description: `About ${id}`,
    category: 'Workshop',
    tags: ['tag'],
    published: true,
    deletedAt: null,
    currentRevision: 1,
  },
  templateRevision: { id: `rev-${id}`, revision: 1 },
});

const revision = (templateId: string) => ({
  id: `rev-of-${templateId}`,
  templateId,
  revision: 4,
  name: `Copy of ${templateId}`,
  content: '{"nodes":[]}',
  contentSchema: 2,
});

const participant: ResolvedWorkspace = {
  id: 'ws-1',
  type: 'WORKSHOP',
  label: 'Workshop',
  workshopId: 'shop-1',
};

const build = (entries: EntryRow[] = [entry('a')]) => {
  const prisma = {
    workspace: { findFirst: jest.fn().mockResolvedValue(null) },
    workshop: {
      findUnique: jest.fn().mockResolvedValue({
        code: 'ABCDEFGH',
        title: 'Workshop',
        status: 'PUBLISHED',
        expiresAt: null,
        templates: entries,
      }),
    },
    workflow: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const workshops = {
    resolve: jest.fn().mockResolvedValue({
      id: 'shop-1',
      code: 'ABCDEFGH',
      title: 'Workshop',
      templates: entries,
    }),
    resolveEntryRevision: jest.fn((row: EntryRow) =>
      Promise.resolve({ ok: true, revision: revision(row.templateId) }),
    ),
  };
  const readiness = {
    startable: jest.fn((rows: EntryRow[]) =>
      Promise.resolve(
        new Map(rows.map((row) => [row.id, { ok: true, revision: 4 }])),
      ),
    ),
  };
  const workspaces = {
    createWorkshop: jest.fn().mockResolvedValue({
      id: 'ws-new',
      type: 'WORKSHOP',
      label: 'Workshop',
      workshopId: 'shop-1',
      createdAt: NOW,
      token: 'ngw_new',
    }),
  };
  const workflows = {
    createFromTemplate: jest.fn().mockResolvedValue({
      id: 'wf-new',
      name: 'Copy',
      slug: 'copy',
      version: 1,
    }),
  };
  const service = new WorkshopParticipantService(
    prisma as unknown as PrismaService,
    workshops as unknown as WorkshopService,
    readiness as unknown as WorkshopReadinessService,
    workspaces as unknown as WorkspaceService,
    workflows as unknown as WorkflowService,
  );
  return { service, prisma, workshops, readiness, workspaces, workflows };
};

describe('WorkshopParticipantService', () => {
  describe('join', () => {
    it('creates a workspace after admitting it, and starts a single entry (AC-005)', async () => {
      const { service, workspaces, workflows, prisma } = build();
      const admit = jest.fn();
      // The first lookup finds no copy; the second, after creating, finds the new one.
      prisma.workflow.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'wf-new' });

      const joined = await service.join('ABCD-EFGH', undefined, admit, NOW);

      expect(admit).toHaveBeenCalledTimes(1);
      expect(workspaces.createWorkshop).toHaveBeenCalledWith(
        'shop-1',
        'Workshop',
      );
      expect(workflows.createFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ws-new' }),
        expect.objectContaining({ templateId: 'tpl-a', revisionId: 'rev-of-tpl-a' }),
      );
      expect(joined).toMatchObject({
        token: 'ngw_new',
        autoStarted: true,
        workflow: { id: 'wf-new' },
        workspace: {
          id: 'ws-new',
          workshop: { code: 'ABCD-EFGH', title: 'Workshop', readOnly: false },
        },
      });
    });

    it('opens the overview for a workshop with several entries (AC-006)', async () => {
      const { service, workflows } = build([entry('a'), entry('b')]);

      const joined = await service.join('ABCDEFGH', undefined, jest.fn(), NOW);

      expect(workflows.createFromTemplate).not.toHaveBeenCalled();
      expect(joined).toMatchObject({ workflow: null, autoStarted: false });
    });

    it('returns the existing workspace on a re-join without admitting (FR-006)', async () => {
      const { service, prisma, workspaces } = build([entry('a'), entry('b')]);
      prisma.workspace.findFirst.mockResolvedValue({
        id: 'ws-1',
        type: 'WORKSHOP',
        label: 'Workshop',
        workshopId: 'shop-1',
      });
      const admit = jest.fn();

      const joined = await service.join('ABCDEFGH', TOKEN, admit, NOW);

      expect(admit).not.toHaveBeenCalled();
      expect(workspaces.createWorkshop).not.toHaveBeenCalled();
      expect(prisma.workspace.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workshopId: 'shop-1',
            type: 'WORKSHOP',
          }),
        }),
      );
      expect(joined).toMatchObject({ token: TOKEN, workspace: { id: 'ws-1' } });
    });

    it('returns the existing copy of a single entry on a re-join', async () => {
      const { service, prisma, workflows } = build();
      prisma.workspace.findFirst.mockResolvedValue({
        id: 'ws-1',
        type: 'WORKSHOP',
        label: 'Workshop',
        workshopId: 'shop-1',
      });
      prisma.workflow.count.mockResolvedValue(2);
      prisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-old',
        name: 'A',
        slug: 'a',
        version: 5,
      });

      const joined = await service.join('ABCDEFGH', TOKEN, jest.fn(), NOW);

      expect(workflows.createFromTemplate).not.toHaveBeenCalled();
      expect(joined).toMatchObject({
        workflow: { id: 'wf-old' },
        autoStarted: false,
      });
    });

    it('leaves a workspace with other work but no copy on the overview', async () => {
      const { service, prisma, workflows } = build();
      prisma.workflow.count.mockResolvedValue(1);

      const joined = await service.join('ABCDEFGH', undefined, jest.fn(), NOW);

      expect(workflows.createFromTemplate).not.toHaveBeenCalled();
      expect(joined).toMatchObject({ workflow: null, autoStarted: false });
    });

    it('keeps the new workspace when the auto-start fails', async () => {
      const { service, workshops } = build();
      workshops.resolveEntryRevision.mockResolvedValue({
        ok: false,
        reason: 'The template is not published.',
      } as never);

      const joined = await service.join('ABCDEFGH', undefined, jest.fn(), NOW);

      expect(joined).toMatchObject({
        token: 'ngw_new',
        workflow: null,
        autoStarted: false,
      });
    });

    it('lets the admission refusal stop the join before anything is created', async () => {
      const { service, workspaces } = build();

      await expect(
        service.join('ABCDEFGH', undefined, () => {
          throw new Error('too many');
        }),
      ).rejects.toThrow('too many');
      expect(workspaces.createWorkshop).not.toHaveBeenCalled();
    });
  });

  describe('current', () => {
    it('lists entries in order with availability and the participant copy', async () => {
      const { service, prisma, readiness } = build([entry('a'), entry('b')]);
      readiness.startable.mockResolvedValue(
        new Map([
          ['a', { ok: true, revision: 4 }],
          ['b', { ok: false, reason: 'This build does not register: x.' }],
        ]) as never,
      );
      prisma.workflow.findMany.mockResolvedValue([
        { id: 'wf-old', name: 'A', slug: 'a', version: 3, sourceTemplateId: 'tpl-a' },
        { id: 'wf-dup', name: 'A', slug: 'a-2', version: 1, sourceTemplateId: 'tpl-a' },
      ]);

      const view = await service.current(participant, NOW);

      expect(view.workshop).toEqual({
        code: 'ABCD-EFGH',
        title: 'Workshop',
        readOnly: false,
      });
      expect(view.entries).toEqual([
        expect.objectContaining({
          id: 'a',
          name: 'Exercise a',
          mode: 'PINNED',
          revision: 4,
          available: true,
          unavailableReason: null,
          myWorkflowId: 'wf-old',
        }),
        expect.objectContaining({
          id: 'b',
          available: false,
          unavailableReason: 'This build does not register: x.',
          myWorkflowId: null,
        }),
      ]);
    });

    it('reports a closed workshop as read-only', async () => {
      const { service, prisma } = build();
      prisma.workshop.findUnique.mockResolvedValue({
        code: 'ABCDEFGH',
        title: 'Workshop',
        status: 'CLOSED',
        expiresAt: null,
        templates: [],
      });

      const view = await service.current(participant, NOW);

      expect(view.workshop.readOnly).toBe(true);
    });

    it('refuses a workspace that is not a workshop workspace', async () => {
      const { service } = build();

      await expect(
        service.current({ ...participant, type: 'LTI', workshopId: null }),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: 'not_a_workshop_workspace' },
      });
    });
  });

  describe('start', () => {
    it('opens the existing copy instead of creating another (AC-007)', async () => {
      const { service, prisma, workflows } = build();
      prisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-old',
        name: 'A',
        slug: 'a',
        version: 3,
      });

      const started = await service.start(participant, 'a');

      expect(started).toEqual({
        workflow: { id: 'wf-old', name: 'A', slug: 'a', version: 3 },
        created: false,
      });
      expect(workflows.createFromTemplate).not.toHaveBeenCalled();
      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', sourceTemplateId: 'tpl-a' },
        }),
      );
    });

    it('converges a lost race on the oldest copy and removes its own', async () => {
      const { service, prisma } = build();
      prisma.workflow.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'wf-winner',
          name: 'A',
          slug: 'a',
          version: 1,
        });

      const started = await service.start(participant, 'a');

      expect(prisma.workflow.deleteMany).toHaveBeenCalledWith({
        where: { id: 'wf-new', workspaceId: 'ws-1' },
      });
      expect(started).toEqual({
        workflow: { id: 'wf-winner', name: 'A', slug: 'a', version: 1 },
        created: false,
      });
    });

    it('answers an entry of another workshop as not found (AC-008)', async () => {
      const { service, workflows } = build();

      await expect(service.start(participant, 'foreign')).rejects.toMatchObject({
        status: 404,
        response: { code: 'workshop_entry_not_found' },
      });
      expect(workflows.createFromTemplate).not.toHaveBeenCalled();
    });

    it('refuses an entry that cannot be resolved', async () => {
      const { service, workshops } = build();
      workshops.resolveEntryRevision.mockResolvedValue({
        ok: false,
        reason: 'The template is not published.',
      } as never);

      await expect(service.start(participant, 'a')).rejects.toMatchObject({
        status: 404,
        response: { code: 'workshop_entry_unavailable' },
      });
    });
  });

  describe('structure', () => {
    it('returns the content the entry would hand out', async () => {
      const { service } = build();

      await expect(service.structure(participant, 'a')).resolves.toEqual({
        entryId: 'a',
        name: 'Copy of tpl-a',
        revision: 4,
        content: '{"nodes":[]}',
      });
    });
  });
});
