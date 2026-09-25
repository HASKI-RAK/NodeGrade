import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma.service.js';
import type { EntryRow } from './workshop-entries.js';
import { WorkshopService } from './workshop.service.js';

const NOW = new Date('2026-09-25T10:00:00.000Z');

const entry = (overrides: Partial<EntryRow> = {}): EntryRow => ({
  id: 'entry-1',
  position: 0,
  templateId: 'tpl-1',
  templateRevisionId: 'rev-2',
  template: {
    id: 'tpl-1',
    slug: 'exercise-one',
    kind: 'WORKFLOW',
    name: 'Exercise one',
    description: null,
    category: null,
    tags: [],
    published: true,
    deletedAt: null,
    currentRevision: 3,
  },
  templateRevision: { id: 'rev-2', revision: 2 },
  ...overrides,
});

const following = (template: Partial<EntryRow['template']> = {}) =>
  entry({
    templateRevisionId: null,
    templateRevision: null,
    template: { ...entry().template, ...template },
  });

const workshopRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'shop-1',
  code: 'ABCDEFGH',
  title: 'Workshop',
  status: 'PUBLISHED',
  expiresAt: null,
  publishedAt: NOW,
  closedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  templates: [entry()],
  ...overrides,
});

const build = () => {
  const tx = {
    workshop: {
      findUnique: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
      update: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue(workshopRow()),
    },
    workshopTemplate: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    workshop: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(workshopRow()),
    },
    template: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'tpl-1', name: 'One', kind: 'WORKFLOW', deletedAt: null },
        { id: 'tpl-2', name: 'Two', kind: 'WORKFLOW', deletedAt: null },
        { id: 'tpl-block', name: 'Block', kind: 'BLOCK', deletedAt: null },
      ]),
    },
    templateRevision: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'rev-1a', templateId: 'tpl-1' }]),
    },
    $transaction: jest.fn((body: (client: typeof tx) => unknown) =>
      Promise.resolve(body(tx)),
    ),
  };
  return {
    prisma,
    tx,
    service: new WorkshopService(prisma as unknown as PrismaService),
  };
};

describe('WorkshopService', () => {
  describe('resolve', () => {
    it('returns a published, unexpired workshop with its entries', async () => {
      const { service, prisma } = build();
      prisma.workshop.findUnique.mockResolvedValue(workshopRow());

      const workshop = await service.resolve('abcd-efgh', NOW);

      expect(prisma.workshop.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'ABCDEFGH' } }),
      );
      expect(workshop.templates).toHaveLength(1);
    });

    it.each([
      ['unknown', null],
      ['draft', workshopRow({ status: 'DRAFT' })],
      ['closed', workshopRow({ status: 'CLOSED' })],
      ['expired', workshopRow({ expiresAt: new Date('2026-09-25T09:00:00Z') })],
    ])('rejects a %s workshop as unavailable', async (_label, row) => {
      const { service, prisma } = build();
      prisma.workshop.findUnique.mockResolvedValue(row);

      await expect(service.resolve('ABCDEFGH', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('does not consult template visibility (SPEC-0022/FR-002)', async () => {
      const { service, prisma } = build();
      prisma.workshop.findUnique.mockResolvedValue(
        workshopRow({
          templates: [
            entry({
              template: {
                ...entry().template,
                published: false,
                deletedAt: NOW,
              },
            }),
          ],
        }),
      );

      await expect(service.resolve('ABCDEFGH', NOW)).resolves.toMatchObject({
        id: 'shop-1',
      });
    });
  });

  describe('resolveEntryRevision', () => {
    it('hands out the pinned revision even when the template is unpublished or deleted (FR-002)', async () => {
      const { service, prisma } = build();
      prisma.templateRevision.findFirst.mockResolvedValue({ id: 'rev-2' });

      const resolution = await service.resolveEntryRevision(
        entry({
          template: { ...entry().template, published: false, deletedAt: NOW },
        }),
      );

      expect(resolution).toEqual({ ok: true, revision: { id: 'rev-2' } });
      expect(prisma.templateRevision.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rev-2' } }),
      );
    });

    it('hands out the current revision for an entry that follows it (FR-003)', async () => {
      const { service, prisma } = build();
      prisma.templateRevision.findFirst.mockResolvedValue({ id: 'rev-3' });

      const resolution = await service.resolveEntryRevision(following());

      expect(resolution).toEqual({ ok: true, revision: { id: 'rev-3' } });
      expect(prisma.templateRevision.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { templateId: 'tpl-1', revision: 3 },
        }),
      );
    });

    it.each([
      [{ published: false }, 'The template is not published.'],
      [{ deletedAt: NOW }, 'The template has been deleted.'],
    ])(
      'makes a following entry unavailable for %o',
      async (template, reason) => {
        const { service, prisma } = build();

        const resolution = await service.resolveEntryRevision(
          following(template),
        );

        expect(resolution).toEqual({ ok: false, reason });
        expect(prisma.templateRevision.findFirst).not.toHaveBeenCalled();
      },
    );

    it('reports a revision that no longer exists', async () => {
      const { service, prisma } = build();
      prisma.templateRevision.findFirst.mockResolvedValue(null);

      await expect(service.resolveEntryRevision(following())).resolves.toEqual({
        ok: false,
        reason: 'The template revision no longer exists.',
      });
    });
  });

  describe('serialize', () => {
    it('describes each entry by template, mode and revision', () => {
      const { service } = build();

      const serialized = service.serialize(
        workshopRow({
          templates: [entry(), { ...following(), id: 'entry-2', position: 1 }],
        }) as never,
      );

      expect(serialized.code).toBe('ABCD-EFGH');
      expect(serialized.templates).toEqual([
        expect.objectContaining({
          id: 'entry-1',
          templateName: 'Exercise one',
          mode: 'PINNED',
          revision: 2,
        }),
        expect.objectContaining({
          id: 'entry-2',
          mode: 'LATEST',
          revision: null,
          currentRevision: 3,
        }),
      ]);
    });
  });

  describe('entries (SPEC-0022/FR-005)', () => {
    it('creates a workshop with its entries in order', async () => {
      const { service, prisma } = build();

      await service.create({
        title: 'Two exercises',
        templates: [
          { templateId: 'tpl-1', templateRevisionId: 'rev-1a' },
          { templateId: 'tpl-2' },
        ],
      });

      expect(prisma.workshop.create.mock.calls[0][0].data.templates).toEqual({
        create: [
          { templateId: 'tpl-1', templateRevisionId: 'rev-1a', position: 0 },
          { templateId: 'tpl-2', templateRevisionId: null, position: 1 },
        ],
      });
    });

    it.each([
      ['no entry', []],
      [
        'a template twice',
        [{ templateId: 'tpl-1' }, { templateId: 'tpl-1' }],
      ],
      ['an unknown template', [{ templateId: 'tpl-missing' }]],
      ['a block template', [{ templateId: 'tpl-block' }]],
      [
        'a revision of another template',
        [{ templateId: 'tpl-2', templateRevisionId: 'rev-1a' }],
      ],
    ])('refuses %s (AC-004)', async (_label, templates) => {
      const { service, prisma } = build();

      await expect(
        service.create({ title: 'Workshop', templates }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'workshop_templates_invalid' },
      });
      expect(prisma.workshop.create).not.toHaveBeenCalled();
    });

    it('replaces entries in place, keyed by template', async () => {
      const { service, tx } = build();

      await service.replaceTemplates('shop-1', [
        { templateId: 'tpl-2' },
        { templateId: 'tpl-1', templateRevisionId: 'rev-1a' },
      ]);

      expect(tx.workshopTemplate.deleteMany).toHaveBeenCalledWith({
        where: { workshopId: 'shop-1', templateId: { notIn: ['tpl-2', 'tpl-1'] } },
      });
      expect(tx.workshopTemplate.upsert.mock.calls.map(([call]) => call)).toEqual([
        {
          where: {
            workshopId_templateId: { workshopId: 'shop-1', templateId: 'tpl-2' },
          },
          update: { templateRevisionId: null, position: 0 },
          create: {
            workshopId: 'shop-1',
            templateId: 'tpl-2',
            templateRevisionId: null,
            position: 0,
          },
        },
        {
          where: {
            workshopId_templateId: { workshopId: 'shop-1', templateId: 'tpl-1' },
          },
          update: { templateRevisionId: 'rev-1a', position: 1 },
          create: {
            workshopId: 'shop-1',
            templateId: 'tpl-1',
            templateRevisionId: 'rev-1a',
            position: 1,
          },
        },
      ]);
    });

    it('keeps the entries of a closed workshop', async () => {
      const { service, tx } = build();
      tx.workshop.findUnique.mockResolvedValue({ status: 'CLOSED' });

      await expect(
        service.replaceTemplates('shop-1', [{ templateId: 'tpl-1' }]),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'workshop_state_conflict' },
      });
      expect(tx.workshopTemplate.upsert).not.toHaveBeenCalled();
    });
  });
});
