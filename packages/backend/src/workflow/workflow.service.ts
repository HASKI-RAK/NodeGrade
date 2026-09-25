import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { positiveNumber } from '../common/env.js';
import { PrismaService } from '../prisma.service.js';
import { TemplateService } from '../template/template.service.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import type {
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from './dto/workflow.dto.js';
import type { IfMatch } from './workflow-etag.js';
import { WorkflowHistoryService } from './workflow-history.service.js';
import { dedupeSlug, slugify } from './workflow-slug.js';

/**
 * Per-workspace workflow cap (escalation E3). Far above what a participant produces in a
 * 35-minute workshop, low enough that an automated client cannot fill the database.
 */
const DEFAULT_MAX_WORKFLOWS = 50;

/** Guards against losing a race to the unique constraint indefinitely. */
const SLUG_RETRIES = 5;

const SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  publishedVersion: true,
  publishedAt: true,
  sourceTemplateId: true,
  sourceTemplateRevisionId: true,
} as const;

export type WorkflowSummary = {
  id: string;
  name: string;
  slug: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  publishedVersion: number | null;
  publishedAt: Date | null;
  sourceTemplateId: string | null;
  sourceTemplateRevisionId: string | null;
};

export type WorkflowDetail = WorkflowSummary & { content: string };

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'P2002';

/**
 * Workflow CRUD, scoped to one workspace (SPEC-0004/FR-001, FR-006).
 *
 * Every method takes the workspace id resolved from the access token, and every query
 * carries it. A workflow id from the URL is never enough on its own — that is AC-007 and
 * AC-008, and the reason there is no `findUnique({ where: { id } })` anywhere below.
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplateService,
    private readonly history: WorkflowHistoryService,
  ) {}

  private get maxWorkflows(): number {
    return positiveNumber(
      process.env.WORKSPACE_MAX_WORKFLOWS,
      DEFAULT_MAX_WORKFLOWS,
    );
  }

  /** Content is omitted: the list feeds a dropdown, not an editor. */
  async list(workspaceId: string): Promise<WorkflowSummary[]> {
    return this.prisma.workflow.findMany({
      where: { workspaceId },
      select: SUMMARY_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(
    workspaceId: string,
    id: string,
    publishedProjection = false,
  ): Promise<WorkflowDetail> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, workspaceId },
      select: { ...SUMMARY_SELECT, content: true, publishedContent: true },
    });

    // 404 rather than 403 for a workflow in another workspace: whether an id exists at
    // all is not something a caller gets to learn by probing.
    if (!workflow) throw this.notFound();
    if (publishedProjection && workflow.publishedContent === null) {
      throw new ConflictException({
        code: 'workflow_not_published',
        message: 'This workflow has not been published for students.',
      });
    }
    const { publishedContent, ...detail } = workflow;
    return {
      ...detail,
      content: publishedProjection
        ? (publishedContent as string)
        : workflow.content,
    };
  }

  async getExecutionContent(
    workspaceId: string,
    id: string,
    publishedProjection: boolean,
  ): Promise<string> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, workspaceId },
      select: { content: true, publishedContent: true },
    });
    if (!workflow) throw this.notFound();
    if (publishedProjection) {
      if (workflow.publishedContent === null) {
        throw new ConflictException({
          code: 'workflow_not_published',
          message: 'This workflow has not been published for students.',
        });
      }
      return workflow.publishedContent;
    }
    return workflow.content;
  }

  async create(
    workspace: ResolvedWorkspace,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowDetail> {
    await this.assertRoom(workspace);
    return this.insert(workspace.id, dto.name, dto.content);
  }

  /**
   * "Use template" (SPEC-0003/FR-006, FR-018).
   *
   * The copy is the user's from the moment it exists; the template is untouched, which
   * is FR-007 by construction rather than by a check. The source revision id is recorded
   * because reset has to reproduce *that* revision later, even after the template has
   * moved on (AC-002) or been unpublished or deleted (AC-014a, AC-017).
   */
  /**
   * Copies a template revision into a workspace, recording where it came from (SPEC-0003/
   * FR-018). Participants reach it only by starting an entry of their workshop
   * (SPEC-0022/FR-014); which revision that is was decided by the entry.
   */
  async createFromTemplate(
    workspace: ResolvedWorkspace,
    source: {
      templateId: string;
      revisionId: string;
      revision: number;
      name: string;
      content: string;
      contentSchema: number;
    },
    nameOverride?: string,
  ): Promise<WorkflowDetail> {
    await this.assertRoom(workspace);

    const workflow = await this.insert(
      workspace.id,
      nameOverride ?? source.name,
      source.content,
      {
        sourceTemplateId: source.templateId,
        sourceTemplateRevisionId: source.revisionId,
        // Carried over rather than stamped current: a revision written before a content
        // migration must still be picked up by it once it is a workflow.
        contentSchema: source.contentSchema,
      },
    );

    this.logger.log(
      `Created workflow ${workflow.id} from template ${source.templateId} revision ${source.revision}`,
    );
    return workflow;
  }

  private async assertRoom(workspace: ResolvedWorkspace): Promise<void> {
    // LTI workspaces are instructor-controlled and hold a course's content; the cap
    // exists to bound anonymous participants, not the institution.
    if (workspace.type === 'LTI') return;

    const count = await this.prisma.workflow.count({
      where: { workspaceId: workspace.id },
    });
    if (count >= this.maxWorkflows) {
      throw new ForbiddenException({
        code: 'workflow_limit_reached',
        message: `A workspace may hold at most ${this.maxWorkflows} workflows.`,
      });
    }
  }

  private async insert(
    workspaceId: string,
    name: string,
    content: string,
    provenance: {
      sourceTemplateId?: string;
      sourceTemplateRevisionId?: string;
      contentSchema?: number;
    } = {},
  ): Promise<WorkflowDetail> {
    const base = slugify(name);

    for (let attempt = 0; attempt < SLUG_RETRIES; attempt += 1) {
      const taken = await this.prisma.workflow.findMany({
        where: { workspaceId, slug: { startsWith: base } },
        select: { slug: true },
      });

      try {
        return await this.prisma.workflow.create({
          data: {
            workspaceId,
            name,
            slug: dedupeSlug(
              base,
              taken.map((row) => row.slug),
            ),
            content,
            ...provenance,
          },
          select: { ...SUMMARY_SELECT, content: true },
        });
      } catch (error) {
        // Two creates picked the same candidate. The constraint is the authority; the
        // next pass sees the winner's slug and moves past it.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    throw new ConflictException({
      code: 'slug_unavailable',
      message: 'Could not allocate a unique name for this workflow.',
    });
  }

  /**
   * The whole of AC-006b lives in the updateMany below.
   *
   * updateMany rather than update: `update` requires a unique `where`, and the condition
   * here is compound — id AND workspace AND expected version. A count of 0 is the atomic
   * answer to "did someone else save first", which no read-then-write can give.
   */
  async update(
    workspaceId: string,
    id: string,
    ifMatch: IfMatch,
    dto: UpdateWorkflowDto,
  ): Promise<WorkflowSummary> {
    const data: {
      name?: string;
      content?: string;
      version: { increment: number };
    } = { version: { increment: 1 } };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.content !== undefined) data.content = dto.content;

    const versionFilter =
      ifMatch.kind === 'versions' ? { version: { in: ifMatch.versions } } : {};

    // Read before the write, and only when a checkpoint is due: what the save is about
    // to replace cannot be recovered afterwards (SPEC-0021/FR-001). A rename carries no
    // graph, so it is not worth a snapshot of content that has not changed.
    const previous =
      dto.content !== undefined && (await this.history.isDue(id))
        ? await this.prisma.workflow.findFirst({
            where: { id, workspaceId },
            select: {
              version: true,
              name: true,
              content: true,
              contentSchema: true,
            },
          })
        : null;

    const { count } = await this.prisma.workflow.updateMany({
      where: { id, workspaceId, ...versionFilter },
      data,
    });

    // Only once the save landed: a rejected save replaced nothing, so there is no past
    // state to keep.
    if (count > 0 && previous) await this.history.capture(id, previous);

    if (count === 0) {
      const current = await this.prisma.workflow.findFirst({
        where: { id, workspaceId },
        select: { version: true },
      });
      if (!current) throw this.notFound();

      // Never overwrite the newer state (FR-013). The client decides: reload, or save a
      // copy. There is no force-save.
      throw new ConflictException({
        code: 'version_conflict',
        currentVersion: current.version,
        message:
          'This workflow was changed elsewhere since it was loaded. Reload it or save a copy.',
      });
    }

    return this.summary(workspaceId, id);
  }

  /**
   * "Reset to template" (SPEC-0003/FR-008, AC-002).
   *
   * Restores the revision the workflow was *created from*, not the template's current
   * revision. That distinction is the whole requirement: a facilitator fixing a typo
   * mid-workshop must not silently change what everyone's reset button does.
   *
   * No If-Match. The user has just confirmed they want their edits discarded, so a
   * stale-version guard would only block the thing they asked for. The version still
   * increments, so another open tab collides on its next save rather than quietly
   * writing the broken graph back.
   */
  async reset(workspaceId: string, id: string): Promise<WorkflowSummary> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, workspaceId },
      select: {
        sourceTemplateRevisionId: true,
        version: true,
        name: true,
        content: true,
        contentSchema: true,
      },
    });
    if (!workflow) throw this.notFound();

    if (!workflow.sourceTemplateRevisionId) {
      throw new ConflictException({
        code: 'workflow_has_no_template',
        message: 'This workflow was not created from a template.',
      });
    }

    const revision = await this.templates.getRevision(
      workflow.sourceTemplateRevisionId,
    );

    // Unconditional, unlike a save: discarding every edit is exactly the operation a
    // user regrets, so the window that coalesces autosaves does not apply (FR-002).
    await this.history.capture(id, workflow, 'reset');

    const { count } = await this.prisma.workflow.updateMany({
      where: { id, workspaceId },
      data: {
        content: revision.content,
        contentSchema: revision.contentSchema,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw this.notFound();

    this.logger.log(
      `Reset workflow ${id} to template revision ${revision.revision}`,
    );
    return this.summary(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const { count } = await this.prisma.workflow.deleteMany({
      where: { id, workspaceId },
    });
    if (count === 0) throw this.notFound();
  }

  /**
   * Snapshots the current content as the student-visible projection (ADR-0007).
   *
   * Replaces the old editor-to-student path copy: under workspace scoping an LTI
   * instructor and their students share one workspace, so without a publish step the
   * instructor's in-progress edits would become visible to students mid-course.
   *
   * Deliberately does not touch `version` — publishing is not a content edit, and
   * bumping it would invalidate the open editor's ETag and make its next autosave
   * conflict for no reason.
   */
  async publish(
    workspaceId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<WorkflowSummary> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, workspaceId },
      select: { content: true, version: true },
    });
    if (!workflow) throw this.notFound();

    // Conditional on the version that was read, so a save landing in between publishes
    // that save or nothing — never a mix of the two.
    const { count } = await this.prisma.workflow.updateMany({
      where: { id, workspaceId, version: workflow.version },
      data: {
        publishedContent: workflow.content,
        publishedVersion: workflow.version,
        publishedAt: now,
      },
    });

    if (count === 0) {
      throw new ConflictException({
        code: 'version_conflict',
        message:
          'This workflow changed while it was being published. Try again.',
      });
    }

    this.logger.log(`Published workflow ${id} at version ${workflow.version}`);
    return this.summary(workspaceId, id);
  }

  private async summary(
    workspaceId: string,
    id: string,
  ): Promise<WorkflowSummary> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, workspaceId },
      select: SUMMARY_SELECT,
    });
    if (!workflow) throw this.notFound();
    return workflow;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'workflow_not_found',
      message: 'No such workflow in this workspace.',
    });
  }
}
