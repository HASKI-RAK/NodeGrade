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
  const prisma = {
    workshop: { findUnique: jest.fn(), create: jest.fn() },
    templateRevision: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
  return {
    prisma,
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
});
