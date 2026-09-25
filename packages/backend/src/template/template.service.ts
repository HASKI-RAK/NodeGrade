import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  RevisionOrigin,
  TemplateKind,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma.service.js';
import {
  TemplateContentError,
  graphNodeTypes,
  hashContent,
  parseGraphContent,
  validateNestedGraph,
} from './template-content.js';
import { getNodeDefinition } from '@haski/ta-lib';

export type TemplateMetadata = {
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
};

export type RevisionInput = TemplateMetadata & {
  content: string;
  interfaces?: unknown;
  origin?: RevisionOrigin;
};

const TEMPLATE_SELECT = {
  id: true,
  slug: true,
  kind: true,
  name: true,
  description: true,
  category: true,
  tags: true,
  published: true,
  currentRevision: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const REVISION_SELECT = {
  id: true,
  templateId: true,
  revision: true,
  origin: true,
  name: true,
  description: true,
  category: true,
  tags: true,
  content: true,
  contentHash: true,
  contentSchema: true,
  interfaces: true,
  createdAt: true,
} as const;

const prismaCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null
    ? ((error as { code?: unknown }).code as string | undefined)
    : undefined;

/**
 * Templates and their immutable revisions (SPEC-0003).
 *
 * The invariant the whole subsystem rests on: a revision is written once and never
 * updated. Everything downstream — a workshop pinned to a revision, a workflow's reset
 * action, a template someone unpublished last week — depends on the content behind a
 * revision id being the same content forever (FR-003a, AC-014a).
 */
@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- reads -------------------------------------------------------------------

  /** The gallery as a participant sees it: published, not deleted (FR-016, FR-017). */
  async listPublished(kind?: TemplateKind) {
    return this.prisma.template.findMany({
      where: { published: true, deletedAt: null, ...(kind ? { kind } : {}) },
      select: TEMPLATE_SELECT,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /** The facilitator's view, which includes unpublished templates (AC-010). */
  async listAll(kind?: TemplateKind, includeDeleted = false) {
    return this.prisma.template.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: TEMPLATE_SELECT,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findBySlug(slug: string, publishedOnly: boolean) {
    const template = await this.prisma.template.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(publishedOnly ? { published: true } : {}),
      },
      select: TEMPLATE_SELECT,
    });
    if (!template) throw this.templateNotFound();
    return template;
  }

  async findById(id: string, publishedOnly: boolean) {
    const template = await this.prisma.template.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(publishedOnly ? { published: true } : {}),
      },
      select: TEMPLATE_SELECT,
    });
    if (!template) throw this.templateNotFound();
    return template;
  }

  async listRevisions(templateId: string) {
    return this.prisma.templateRevision.findMany({
      where: { templateId },
      select: { ...REVISION_SELECT, content: false },
      orderBy: { revision: 'desc' },
    });
  }

  /**
   * Resolves a revision by id with no template-level filtering, on purpose.
   *
   * A workflow created from revision R must still be resettable after the template is
   * unpublished or deleted (FR-003c, FR-017a, AC-017). Gating this on the template's
   * current visibility would break exactly the case those requirements exist for.
   */
  async getRevision(revisionId: string) {
    const revision = await this.prisma.templateRevision.findUnique({
      where: { id: revisionId },
      select: REVISION_SELECT,
    });
    if (!revision) throw this.revisionNotFound();
    return revision;
  }

  async getCurrentRevision(templateId: string) {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      select: { currentRevision: true },
    });
    if (!template) throw this.templateNotFound();

    const revision = await this.prisma.templateRevision.findFirst({
      where: { templateId, revision: template.currentRevision },
      select: REVISION_SELECT,
    });
    if (!revision) throw this.revisionNotFound();
    return revision;
  }

  /** Which node types a revision needs, so a client can flag it unavailable up front. */
  requiredNodeTypes(content: string): string[] {
    return graphNodeTypes(this.validate(content));
  }

  // --- writes ------------------------------------------------------------------

  async createTemplate(input: {
    slug: string;
    kind: TemplateKind;
    published?: boolean;
    revision: RevisionInput;
  }) {
    const content = this.normalize(input.revision.content);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.template.create({
          data: {
            slug: input.slug,
            kind: input.kind,
            published: input.published ?? false,
            currentRevision: 1,
            ...this.metadata(input.revision),
          },
          select: TEMPLATE_SELECT,
        });

        const revision = await tx.templateRevision.create({
          data: {
            templateId: template.id,
            revision: 1,
            origin: input.revision.origin ?? 'FACILITATOR',
            content,
            contentHash: hashContent(content),
            interfaces: this.interfacesFor(input.kind, input.revision),
            ...this.metadata(input.revision),
          },
          select: REVISION_SELECT,
        });

        return { template, revision };
      });
    } catch (error) {
      if (prismaCode(error) === 'P2002') {
        throw new ConflictException({
          code: 'template_slug_taken',
          message: `A template with the slug "${input.slug}" already exists.`,
        });
      }
      throw error;
    }
  }

  /**
   * Records a modification as a new revision (FR-003).
   *
   * The increment and the insert share a transaction, and `currentRevision` is a number
   * rather than a pointer to the current revision row (ADR-0003). That makes "allocate
   * the next revision number" a single atomic UPDATE rather than a read, a decision and
   * a write — so two facilitators saving at once get R+1 and R+2, never two R+1s.
   */
  async addRevision(templateId: string, input: RevisionInput) {
    const content = this.normalize(input.content);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.template.update({
          where: { id: templateId },
          data: {
            currentRevision: { increment: 1 },
            ...this.metadata(input),
          },
          select: { currentRevision: true, kind: true },
        });

        return tx.templateRevision.create({
          data: {
            templateId,
            revision: template.currentRevision,
            origin: input.origin ?? 'FACILITATOR',
            content,
            contentHash: hashContent(content),
            interfaces: this.interfacesFor(template.kind, input),
            ...this.metadata(input),
          },
          select: REVISION_SELECT,
        });
      });
    } catch (error) {
      if (prismaCode(error) === 'P2025') throw this.templateNotFound();
      throw error;
    }
  }

  /**
   * Publishing and unpublishing change visibility only (FR-017a).
   *
   * They never touch revisions, so a workshop pinned to a revision of an unpublished
   * template keeps working — it just stops being offered in the gallery.
   */
  async setPublished(templateId: string, published: boolean) {
    try {
      return await this.prisma.template.update({
        where: { id: templateId },
        data: { published },
        select: TEMPLATE_SELECT,
      });
    } catch (error) {
      if (prismaCode(error) === 'P2025') throw this.templateNotFound();
      throw error;
    }
  }

  /**
   * Soft delete (FR-003c). A hard delete is not available: revisions are referenced with
   * onDelete: Restrict, so once any workflow was created from this template the database
   * would refuse anyway, and the requirement is that those revisions stay resolvable.
   */
  async softDelete(templateId: string) {
    try {
      return await this.prisma.template.update({
        where: { id: templateId },
        data: { deletedAt: new Date(), published: false },
        select: TEMPLATE_SELECT,
      });
    } catch (error) {
      if (prismaCode(error) === 'P2025') throw this.templateNotFound();
      throw error;
    }
  }

  /**
   * Deletes an unreferenced revision (FR-003b).
   *
   * The guard that matters is the foreign key, not the check below: a service-side
   * "is anything pointing at this" is a read followed by a write, and a workflow created
   * in between would slip through. The database raises P2003 and that is the authority;
   * the pre-check exists only to produce a better message in the common case.
   */
  async deleteRevision(templateId: string, revision: number) {
    const row = await this.prisma.templateRevision.findFirst({
      where: { templateId, revision },
      select: { id: true, template: { select: { currentRevision: true } } },
    });
    if (!row) throw this.revisionNotFound();

    // A workshop entry that follows the newest revision reads currentRevision; deleting
    // that revision would leave the entry pointing at nothing (SPEC-0022/FR-018).
    if (row.template.currentRevision === revision) {
      const followers = await this.prisma.workshopTemplate.count({
        where: { templateId, templateRevisionId: null },
      });
      if (followers > 0)
        throw new ConflictException({
          code: 'revision_current_in_use',
          message: `Revision ${revision} is the current revision, and ${followers} workshop(s) follow it.`,
        });
    }

    const references = await this.countReferences(row.id);
    if (references > 0) throw this.revisionReferenced(references);

    try {
      await this.prisma.templateRevision.delete({ where: { id: row.id } });
    } catch (error) {
      if (prismaCode(error) === 'P2003') throw this.revisionReferenced();
      throw error;
    }
  }

  private async countReferences(revisionId: string): Promise<number> {
    const [workflows, entries, legacyWorkshops] = await Promise.all([
      this.prisma.workflow.count({
        where: { sourceTemplateRevisionId: revisionId },
      }),
      this.prisma.workshopTemplate.count({
        where: { templateRevisionId: revisionId },
      }),
      // The legacy single-template column still carries a restrictive foreign key until
      // it is dropped (SPEC-0022 constraints).
      this.prisma.workshop.count({ where: { templateRevisionId: revisionId } }),
    ]);
    return workflows + entries + legacyWorkshops;
  }

  // --- helpers -----------------------------------------------------------------

  private metadata(input: TemplateMetadata) {
    return {
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
    };
  }

  /**
   * Re-serializes through a parse so stored content is canonical, and so malformed
   * content is rejected at the point it enters the store rather than at the point a
   * participant tries to open it mid-workshop.
   */
  private normalize(content: string): string {
    return JSON.stringify(this.validate(content));
  }

  private validate(
    content: string,
  ): import('./template-content.js').GraphContent {
    let parsed: import('./template-content.js').GraphContent;
    try {
      parsed = parseGraphContent(content);
    } catch (error) {
      if (error instanceof TemplateContentError) {
        throw new BadRequestException({
          code: 'template_content_invalid',
          message: error.message,
        });
      }
      throw error;
    }
    // Gate-4 limits enforce on write: depth, node/link counts, boundary integrity.
    // graph/subgraph is a container, not a registered node definition.
    const issues = validateNestedGraph(parsed, {
      registeredType: (type) =>
        type === 'graph/subgraph' || getNodeDefinition(type) !== undefined,
    });
    if (issues.length > 0) {
      const first = issues[0];
      throw new BadRequestException({
        code: 'template_content_invalid',
        message: `${first.path}: ${first.message}`,
      });
    }
    return parsed;
  }

  private interfacesFor(kind: TemplateKind, input: RevisionInput) {
    if (kind !== 'BLOCK') return undefined;
    return input.interfaces === undefined
      ? undefined
      : (input.interfaces as object);
  }

  private templateNotFound() {
    return new NotFoundException({
      code: 'template_not_found',
      message: 'No such template.',
    });
  }

  private revisionNotFound() {
    return new NotFoundException({
      code: 'template_revision_not_found',
      message: 'No such template revision.',
    });
  }

  private revisionReferenced(references?: number) {
    return new ConflictException({
      code: 'revision_referenced',
      ...(references === undefined ? {} : { references }),
      message:
        'This revision is in use by a workflow or workshop and cannot be deleted.',
    });
  }
}
