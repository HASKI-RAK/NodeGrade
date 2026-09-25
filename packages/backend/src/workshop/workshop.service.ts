import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type {
  CreateWorkshopDto,
  WorkshopTemplateEntryDto,
} from './dto/workshop.dto.js';
import {
  ENTRY_SELECT,
  entryUnavailableReason,
  serializeEntry,
  type EntryRow,
} from './workshop-entries.js';
import {
  displayWorkshopCode,
  generateWorkshopCode,
  normalizeWorkshopCode,
} from './workshop-code.js';

const WORKSHOP_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  expiresAt: true,
  publishedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  templates: { select: ENTRY_SELECT, orderBy: { position: 'asc' } },
} as const;

/** The revision an entry hands out, with what a copy of it needs. */
export type EntryRevision = {
  id: string;
  templateId: string;
  revision: number;
  name: string;
  content: string;
  contentSchema: number;
};

export type EntryResolution =
  { ok: true; revision: EntryRevision } | { ok: false; reason: string };

const ENTRY_REVISION_SELECT = {
  id: true,
  templateId: true,
  revision: true,
  name: true,
  content: true,
  contentSchema: true,
} as const;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'P2002';

@Injectable()
export class WorkshopService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.workshop.findMany({
      select: WORKSHOP_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateWorkshopDto) {
    const entries = await this.validateEntries(dto.templates);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.prisma.workshop.create({
          data: {
            title: dto.title,
            code: generateWorkshopCode(),
            templates: { create: entries },
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          },
          select: WORKSHOP_SELECT,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException({
      code: 'workshop_code_unavailable',
      message: 'Could not allocate a workshop code.',
    });
  }

  /**
   * Replaces the templates of a DRAFT or PUBLISHED workshop (SPEC-0022/FR-005).
   *
   * Entries are updated in place, keyed by template, so a participant's overview that
   * still holds an entry id keeps working when only its revision or position changed.
   */
  async replaceTemplates(id: string, templates: WorkshopTemplateEntryDto[]) {
    const entries = await this.validateEntries(templates);
    return this.prisma.$transaction(async (tx) => {
      const workshop = await tx.workshop.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!workshop) throw this.unavailable();
      if (workshop.status === 'CLOSED')
        throw new ConflictException({
          code: 'workshop_state_conflict',
          message: 'A closed workshop keeps its templates.',
        });

      await tx.workshopTemplate.deleteMany({
        where: {
          workshopId: id,
          templateId: { notIn: entries.map((entry) => entry.templateId) },
        },
      });
      for (const entry of entries)
        await tx.workshopTemplate.upsert({
          where: {
            workshopId_templateId: {
              workshopId: id,
              templateId: entry.templateId,
            },
          },
          update: {
            templateRevisionId: entry.templateRevisionId,
            position: entry.position,
          },
          create: { workshopId: id, ...entry },
        });
      await tx.workshop.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      return tx.workshop.findUniqueOrThrow({
        where: { id },
        select: WORKSHOP_SELECT,
      });
    });
  }

  async publish(id: string, now: Date = new Date()) {
    return this.transition(id, 'DRAFT', {
      status: 'PUBLISHED',
      publishedAt: now,
      closedAt: null,
    });
  }

  async close(id: string, now: Date = new Date()) {
    return this.transition(id, 'PUBLISHED', {
      status: 'CLOSED',
      closedAt: now,
    });
  }

  /**
   * A code a participant may join: PUBLISHED and not expired (SPEC-0014/FR-003).
   *
   * Template visibility is not consulted here. A pinned entry keeps working after its
   * template is unpublished (SPEC-0022/FR-002); whether any entry can be started is the
   * readiness check's question, not the code's.
   */
  async resolve(code: string, now: Date = new Date()) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { code: normalizeWorkshopCode(code) },
      select: WORKSHOP_SELECT,
    });
    if (
      !workshop ||
      workshop.status !== 'PUBLISHED' ||
      (workshop.expiresAt !== null && workshop.expiresAt <= now)
    ) {
      throw this.unavailable();
    }
    return workshop;
  }

  /**
   * The revision a participant starting this entry receives now: the pinned one, or the
   * template's current revision (SPEC-0022/FR-002, FR-003).
   */
  async resolveEntryRevision(entry: EntryRow): Promise<EntryResolution> {
    const reason = entryUnavailableReason(entry);
    if (reason !== null) return { ok: false, reason };

    const revision = await this.prisma.templateRevision.findFirst({
      where:
        entry.templateRevisionId !== null
          ? { id: entry.templateRevisionId }
          : {
              templateId: entry.templateId,
              revision: entry.template.currentRevision,
            },
      select: ENTRY_REVISION_SELECT,
    });
    return revision
      ? { ok: true, revision }
      : { ok: false, reason: 'The template revision no longer exists.' };
  }

  serialize(workshop: Awaited<ReturnType<WorkshopService['create']>>) {
    return {
      ...workshop,
      templates: workshop.templates.map(serializeEntry),
      code: displayWorkshopCode(workshop.code),
      expiresAt: workshop.expiresAt?.toISOString() ?? null,
      publishedAt: workshop.publishedAt?.toISOString() ?? null,
      closedAt: workshop.closedAt?.toISOString() ?? null,
      createdAt: workshop.createdAt.toISOString(),
      updatedAt: workshop.updatedAt.toISOString(),
    };
  }

  private async transition(
    id: string,
    from: 'DRAFT' | 'PUBLISHED',
    data: {
      status: 'PUBLISHED' | 'CLOSED';
      publishedAt?: Date;
      closedAt: Date | null;
    },
  ) {
    const { count } = await this.prisma.workshop.updateMany({
      where: { id, status: from },
      data,
    });
    if (count === 0) {
      throw new ConflictException({
        code: 'workshop_state_conflict',
        message: `Workshop cannot move from its current state to ${data.status}.`,
      });
    }
    const workshop = await this.prisma.workshop.findUnique({
      where: { id },
      select: WORKSHOP_SELECT,
    });
    if (!workshop) throw this.unavailable();
    return workshop;
  }

  /**
   * Entries a facilitator may hand out: at least one, one per template, workflow
   * templates that are not deleted, and pinned revisions that belong to their template.
   */
  private async validateEntries(entries: WorkshopTemplateEntryDto[]) {
    const invalid = (message: string) =>
      new BadRequestException({ code: 'workshop_templates_invalid', message });
    if (entries.length === 0)
      throw invalid('A workshop needs at least one template.');
    const templateIds = entries.map((entry) => entry.templateId);
    if (new Set(templateIds).size !== templateIds.length)
      throw invalid('Each template can be offered once per workshop.');

    const [templates, revisions] = await Promise.all([
      this.prisma.template.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true, kind: true, deletedAt: true },
      }),
      this.prisma.templateRevision.findMany({
        where: {
          id: {
            in: entries.flatMap((entry) =>
              entry.templateRevisionId ? [entry.templateRevisionId] : [],
            ),
          },
        },
        select: { id: true, templateId: true },
      }),
    ]);
    const templateById = new Map(templates.map((row) => [row.id, row]));
    const revisionById = new Map(revisions.map((row) => [row.id, row]));

    return entries.map((entry, position) => {
      const template = templateById.get(entry.templateId);
      if (!template || template.deletedAt !== null)
        throw invalid('A selected template does not exist.');
      if (template.kind !== 'WORKFLOW')
        throw invalid(
          `“${template.name}” is a block, not a workflow template.`,
        );
      const revisionId = entry.templateRevisionId ?? null;
      if (
        revisionId !== null &&
        revisionById.get(revisionId)?.templateId !== entry.templateId
      )
        throw invalid(
          `The pinned revision does not belong to “${template.name}”.`,
        );
      return {
        templateId: entry.templateId,
        templateRevisionId: revisionId,
        position,
      };
    });
  }

  private unavailable(code = 'workshop_unavailable'): NotFoundException {
    return new NotFoundException({
      code,
      message: 'This workshop is unavailable.',
    });
  }
}
