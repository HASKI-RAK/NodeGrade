import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import {
  hashWorkspaceToken,
  isWorkspaceTokenShape,
  issueWorkspaceToken,
} from '../workspace/workspace-token.js';
import { slugify } from '../workflow/workflow-slug.js';
import type { CreateWorkshopDto } from './dto/workshop.dto.js';
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
  templateId: true,
  templateRevisionId: true,
  expiresAt: true,
  publishedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
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
    const revision = await this.prisma.templateRevision.findUnique({
      where: { id: dto.templateRevisionId },
      select: {
        id: true,
        templateId: true,
        template: { select: { kind: true, deletedAt: true } },
      },
    });
    if (
      !revision ||
      revision.template.kind !== 'WORKFLOW' ||
      revision.template.deletedAt !== null
    ) {
      throw this.unavailable('template_revision_not_found');
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.prisma.workshop.create({
          data: {
            title: dto.title,
            code: generateWorkshopCode(),
            templateId: revision.templateId,
            templateRevisionId: revision.id,
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

  async resolve(code: string, now: Date = new Date()) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { code: normalizeWorkshopCode(code) },
      select: {
        ...WORKSHOP_SELECT,
        template: { select: { deletedAt: true, published: true } },
        templateRevision: { select: { id: true } },
      },
    });
    if (
      !workshop ||
      workshop.status !== 'PUBLISHED' ||
      (workshop.expiresAt !== null && workshop.expiresAt <= now) ||
      workshop.template.deletedAt !== null ||
      !workshop.template.published
    ) {
      throw this.unavailable();
    }
    return workshop;
  }

  async join(
    code: string,
    presentedToken: string | undefined,
    now: Date = new Date(),
  ) {
    const workshop = await this.resolve(code, now);

    if (isWorkspaceTokenShape(presentedToken)) {
      const existing = await this.prisma.workspace.findFirst({
        where: {
          tokenHash: hashWorkspaceToken(presentedToken as string),
          workshopId: workshop.id,
          type: 'WORKSHOP',
        },
        select: {
          id: true,
          type: true,
          label: true,
          workshopId: true,
          workflows: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, slug: true, version: true },
          },
        },
      });
      if (existing?.workflows[0]) {
        return {
          workspace: {
            id: existing.id,
            type: existing.type,
            label: existing.label,
            workshopId: existing.workshopId,
          },
          token: presentedToken,
          workflow: existing.workflows[0],
        };
      }
    }

    const revision = await this.prisma.templateRevision.findUnique({
      where: { id: workshop.templateRevisionId },
      select: {
        id: true,
        templateId: true,
        name: true,
        content: true,
        contentSchema: true,
      },
    });
    if (!revision) throw this.unavailable();

    const issued = issueWorkspaceToken();
    const created = await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          type: 'WORKSHOP',
          label: workshop.title,
          workshopId: workshop.id,
          tokenHash: issued.tokenHash,
        },
        select: {
          id: true,
          type: true,
          label: true,
          workshopId: true,
        },
      });
      const workflow = await tx.workflow.create({
        data: {
          workspaceId: workspace.id,
          name: revision.name,
          slug: slugify(revision.name),
          content: revision.content,
          contentSchema: revision.contentSchema,
          sourceTemplateId: revision.templateId,
          sourceTemplateRevisionId: revision.id,
        },
        select: { id: true, name: true, slug: true, version: true },
      });
      return { workspace, workflow };
    });

    return { ...created, token: issued.token };
  }

  serialize(workshop: Awaited<ReturnType<WorkshopService['create']>>) {
    return {
      ...workshop,
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

  private unavailable(code = 'workshop_unavailable'): NotFoundException {
    return new NotFoundException({
      code,
      message: 'This workshop is unavailable.',
    });
  }
}
