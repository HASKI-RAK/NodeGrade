import { PrismaService } from '../prisma.service.js';
import { hashContent } from './template-content.js';
import { TemplateService } from './template.service.js';

const CONTENT = '{"nodes":[{"id":1,"type":"input/answer"}]}';

const templateRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'tpl-1',
  slug: 'demo',
  kind: 'WORKFLOW',
  name: 'Demo',
  description: null,
  category: null,
  tags: [],
  published: true,
  currentRevision: 1,
  deletedAt: null,
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  updatedAt: new Date('2026-09-15T10:00:00.000Z'),
  ...overrides,
});

const revisionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rev-1',
  templateId: 'tpl-1',
  revision: 1,
  origin: 'BUNDLED',
  name: 'Demo',
  description: null,
  category: null,
  tags: [],
  content: CONTENT,
  contentHash: hashContent(CONTENT),
  contentSchema: 2,
  interfaces: null,
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  ...overrides,
});

const build = () => {
  const template = {
    findMany: jest.fn().mockResolvedValue([templateRow()]),
    findFirst: jest.fn().mockResolvedValue(templateRow()),
    findUnique: jest.fn().mockResolvedValue(templateRow()),
    create: jest.fn().mockResolvedValue(templateRow()),
    update: jest.fn().mockResolvedValue(templateRow()),
  };
  const templateRevision = {
    findMany: jest.fn().mockResolvedValue([revisionRow()]),
    findFirst: jest.fn().mockResolvedValue(revisionRow()),
    findUnique: jest.fn().mockResolvedValue(revisionRow()),
    create: jest.fn().mockResolvedValue(revisionRow()),
    delete: jest.fn().mockResolvedValue(revisionRow()),
    count: jest.fn().mockResolvedValue(0),
  };
  const workflow = { count: jest.fn().mockResolvedValue(0) };
  const workshop = { count: jest.fn().mockResolvedValue(0) };
  const workshopTemplate = { count: jest.fn().mockResolvedValue(0) };

  const prisma = {
    template,
    templateRevision,
    workflow,
    workshop,
    workshopTemplate,
    // The transaction callback runs against the same mocks, which is what lets these
    // tests assert the ordering inside it.
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({ template, templateRevision, workflow, workshop }),
      ),
    ),
  };

  return {
    service: new TemplateService(prisma as unknown as PrismaService),
    template,
    templateRevision,
    workflow,
    workshop,
    workshopTemplate,
    prisma,
  };
};

describe('TemplateService', () => {
  describe('listPublished', () => {
    it('hides unpublished and deleted templates (FR-016, FR-017)', async () => {
      const { service, template } = build();

      await service.listPublished();

      expect(template.findMany.mock.calls[0][0].where).toEqual({
        published: true,
        deletedAt: null,
      });
    });

    it('filters by kind when asked', async () => {
      const { service, template } = build();

      await service.listPublished('BLOCK');

      expect(template.findMany.mock.calls[0][0].where.kind).toBe('BLOCK');
    });
  });

  describe('listAll', () => {
    it('shows the facilitator unpublished templates too (AC-010)', async () => {
      const { service, template } = build();

      await service.listAll();

      expect(template.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
      });
    });

    it('can include soft-deleted templates', async () => {
      const { service, template } = build();

      await service.listAll(undefined, true);

      expect(template.findMany.mock.calls[0][0].where).toEqual({});
    });
  });

  describe('createTemplate', () => {
    it('creates the template and revision 1 in one transaction', async () => {
      const { service, prisma, template, templateRevision } = build();

      await service.createTemplate({
        slug: 'demo',
        kind: 'WORKFLOW',
        revision: { name: 'Demo', content: CONTENT },
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(template.create.mock.calls[0][0].data.currentRevision).toBe(1);
      expect(templateRevision.create.mock.calls[0][0].data.revision).toBe(1);
    });

    it('stores a hash of the content, for the seeder to compare against', async () => {
      const { service, templateRevision } = build();

      await service.createTemplate({
        slug: 'demo',
        kind: 'WORKFLOW',
        revision: { name: 'Demo', content: CONTENT },
      });

      const data = templateRevision.create.mock.calls[0][0].data;
      expect(data.contentHash).toBe(hashContent(data.content));
    });

    it('defaults to unpublished, so authoring is not immediately public', async () => {
      const { service, template } = build();

      await service.createTemplate({
        slug: 'demo',
        kind: 'WORKFLOW',
        revision: { name: 'Demo', content: CONTENT },
      });

      expect(template.create.mock.calls[0][0].data.published).toBe(false);
    });

    it('rejects content that is not a graph', async () => {
      const { service, template } = build();

      await expect(
        service.createTemplate({
          slug: 'demo',
          kind: 'WORKFLOW',
          revision: { name: 'Demo', content: 'not json' },
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(template.create).not.toHaveBeenCalled();
    });

    it('rejects nested content that breaks block limits', async () => {
      const { service, template } = build();
      const nested = JSON.stringify({
        nodes: [
          {
            id: 1,
            type: 'graph/subgraph',
            title: 'Block',
            properties: { templateBoundary: [] },
            subgraph: {
              nodes: [{ id: 1, type: 'input/telepathy' }],
              links: [],
            },
          },
        ],
        links: [],
      });

      await expect(
        service.createTemplate({
          slug: 'demo',
          kind: 'WORKFLOW',
          revision: { name: 'Demo', content: nested },
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(template.create).not.toHaveBeenCalled();
    });

    it('reports a taken slug as a conflict', async () => {
      const { service, template } = build();
      template.create.mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );

      await expect(
        service.createTemplate({
          slug: 'demo',
          kind: 'WORKFLOW',
          revision: { name: 'Demo', content: CONTENT },
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'template_slug_taken' },
      });
    });

    it('keeps interfaces on blocks and drops them on workflows', async () => {
      const { service, templateRevision } = build();
      const interfaces = { inputs: [], outputs: [] };

      await service.createTemplate({
        slug: 'block',
        kind: 'BLOCK',
        revision: { name: 'Block', content: CONTENT, interfaces },
      });
      expect(templateRevision.create.mock.calls[0][0].data.interfaces).toEqual(
        interfaces,
      );

      await service.createTemplate({
        slug: 'flow',
        kind: 'WORKFLOW',
        revision: { name: 'Flow', content: CONTENT, interfaces },
      });
      expect(
        templateRevision.create.mock.calls[1][0].data.interfaces,
      ).toBeUndefined();
    });
  });

  describe('addRevision', () => {
    it('allocates the next number with an atomic increment (FR-003)', async () => {
      const { service, template, templateRevision } = build();
      template.update.mockResolvedValue({
        currentRevision: 4,
        kind: 'WORKFLOW',
      });

      await service.addRevision('tpl-1', { name: 'Demo v4', content: CONTENT });

      // Not read-then-write: two facilitators saving at once must get 4 and 5, never
      // two 4s that collide on @@unique([templateId, revision]).
      expect(template.update.mock.calls[0][0].data.currentRevision).toEqual({
        increment: 1,
      });
      expect(templateRevision.create.mock.calls[0][0].data.revision).toBe(4);
    });

    it('never updates an existing revision row (FR-003a)', async () => {
      const { service, templateRevision } = build();

      await service.addRevision('tpl-1', { name: 'Demo v2', content: CONTENT });

      expect(templateRevision).not.toHaveProperty('update');
      expect(templateRevision.create).toHaveBeenCalledTimes(1);
    });

    it('reports an unknown template as missing', async () => {
      const { service, template } = build();
      template.update.mockRejectedValue(
        Object.assign(new Error('not found'), { code: 'P2025' }),
      );

      await expect(
        service.addRevision('nope', { name: 'x', content: CONTENT }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('setPublished', () => {
    it('touches visibility only, never revisions (FR-017a)', async () => {
      const { service, template, templateRevision } = build();

      await service.setPublished('tpl-1', false);

      expect(template.update.mock.calls[0][0].data).toEqual({
        published: false,
      });
      expect(templateRevision.create).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('hides rather than removes, so revisions stay resolvable (FR-003c)', async () => {
      const { service, template } = build();

      await service.softDelete('tpl-1');

      const data = template.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.published).toBe(false);
    });
  });

  describe('getRevision', () => {
    it('resolves without regard to the template being published or deleted', async () => {
      const { service, templateRevision } = build();

      await service.getRevision('rev-1');

      // No template join and no visibility filter: a workshop pinned to this revision
      // has to keep working after an unpublish or a delete (AC-014a, AC-017).
      expect(templateRevision.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rev-1' } }),
      );
    });

    it('reports an unknown revision as missing', async () => {
      const { service, templateRevision } = build();
      templateRevision.findUnique.mockResolvedValue(null);

      await expect(service.getRevision('rev-9')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('deleteRevision', () => {
    /** Revision 1 of a template whose current revision is `current`. */
    const buildDeleting = (current = 3) => {
      const built = build();
      built.templateRevision.findFirst.mockResolvedValue({
        ...revisionRow(),
        template: { currentRevision: current },
      });
      return built;
    };

    it('refuses while a workflow references it (FR-003b)', async () => {
      const { service, workflow, templateRevision } = buildDeleting();
      workflow.count.mockResolvedValue(1);

      await expect(service.deleteRevision('tpl-1', 1)).rejects.toMatchObject({
        status: 409,
        response: { code: 'revision_referenced' },
      });
      expect(templateRevision.delete).not.toHaveBeenCalled();
    });

    it('refuses while a legacy workshop column references it', async () => {
      const { service, workshop, templateRevision } = buildDeleting();
      workshop.count.mockResolvedValue(1);

      await expect(service.deleteRevision('tpl-1', 1)).rejects.toMatchObject({
        status: 409,
      });
      expect(templateRevision.delete).not.toHaveBeenCalled();
    });

    it('refuses while a workshop entry pins it (SPEC-0022)', async () => {
      const { service, workshopTemplate, templateRevision } = buildDeleting();
      workshopTemplate.count.mockResolvedValue(1);

      await expect(service.deleteRevision('tpl-1', 1)).rejects.toMatchObject({
        status: 409,
        response: { code: 'revision_referenced' },
      });
      expect(workshopTemplate.count).toHaveBeenCalledWith({
        where: { templateRevisionId: 'rev-1' },
      });
      expect(templateRevision.delete).not.toHaveBeenCalled();
    });

    it('refuses the current revision while a workshop follows it (SPEC-0022/AC-014)', async () => {
      const { service, workshopTemplate, templateRevision } = buildDeleting(1);
      workshopTemplate.count.mockImplementation(
        ({ where }: { where: { templateRevisionId: string | null } }) =>
          Promise.resolve(where.templateRevisionId === null ? 2 : 0),
      );

      await expect(service.deleteRevision('tpl-1', 1)).rejects.toMatchObject({
        status: 409,
        response: { code: 'revision_current_in_use' },
      });
      expect(templateRevision.delete).not.toHaveBeenCalled();
    });

    it('deletes the current revision when no workshop follows it', async () => {
      const { service, templateRevision } = buildDeleting(1);

      await service.deleteRevision('tpl-1', 1);

      expect(templateRevision.delete).toHaveBeenCalledWith({
        where: { id: 'rev-1' },
      });
    });

    it('treats the foreign key as the authority, not the pre-check', async () => {
      const { service, templateRevision } = buildDeleting();
      // The pre-check passes and a reference appears before the delete lands.
      templateRevision.delete.mockRejectedValue(
        Object.assign(new Error('fk'), { code: 'P2003' }),
      );

      await expect(service.deleteRevision('tpl-1', 1)).rejects.toMatchObject({
        status: 409,
        response: { code: 'revision_referenced' },
      });
    });

    it('deletes an unreferenced revision', async () => {
      const { service, templateRevision } = buildDeleting();

      await service.deleteRevision('tpl-1', 1);

      expect(templateRevision.delete).toHaveBeenCalledWith({
        where: { id: 'rev-1' },
      });
    });
  });

  describe('requiredNodeTypes', () => {
    it('reports what a client needs before it tries to open the template', () => {
      const { service } = build();

      expect(
        service.requiredNodeTypes(
          '{"nodes":[{"id":1,"type":"models/llm"},{"id":2,"type":"input/answer"}]}',
        ),
      ).toEqual(['input/answer', 'models/llm']);
    });
  });
});
