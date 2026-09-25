import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import {
  WorkflowService,
  type WorkflowSummary,
} from '../workflow/workflow.service.js';
import {
  WorkspaceService,
  isWorkshopReadOnly,
  type ResolvedWorkspace,
} from '../workspace/workspace.service.js';
import {
  hashWorkspaceToken,
  isWorkspaceTokenShape,
} from '../workspace/workspace-token.js';
import { displayWorkshopCode } from './workshop-code.js';
import { ENTRY_SELECT, entryMode, type EntryRow } from './workshop-entries.js';
import { WorkshopReadinessService } from './workshop-readiness.service.js';
import { WorkshopService } from './workshop.service.js';

const WORKFLOW_REF_SELECT = {
  id: true,
  name: true,
  slug: true,
  version: true,
} as const;

type WorkflowRef = { id: string; name: string; slug: string; version: number };

/**
 * What a workshop participant does: join, see the workshop's templates, and start them
 * (SPEC-0022/FR-006 to FR-010). Every method but the join takes the workspace resolved
 * from the participant's token; nothing here reads a workspace or workshop id from the
 * request (ADR-0001).
 */
@Injectable()
export class WorkshopParticipantService {
  private readonly logger = new Logger(WorkshopParticipantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workshops: WorkshopService,
    private readonly readiness: WorkshopReadinessService,
    private readonly workspaces: WorkspaceService,
    private readonly workflows: WorkflowService,
  ) {}

  /**
   * Joins a published workshop (SPEC-0014/FR-003; SPEC-0022/FR-006, FR-007).
   *
   * A presented token of this workshop returns its workspace whatever it holds. Otherwise
   * `admitNewWorkspace` runs — it is where the caller rate-limits (FR-015) — and a new
   * workspace is created. `workflow` is what to open instead of the overview: for a
   * single-entry workshop, the participant's copy, started now if `autoStarted`. A failed
   * start is logged and leaves the participant on the overview with their token, rather
   * than losing the workspace.
   */
  async join(
    code: string,
    presentedToken: string | undefined,
    admitNewWorkspace: () => void,
    now: Date = new Date(),
  ) {
    const workshop = await this.workshops.resolve(code, now);

    let workspace: ResolvedWorkspace | null = null;
    let token = presentedToken;
    if (isWorkspaceTokenShape(presentedToken)) {
      workspace = await this.prisma.workspace.findFirst({
        where: {
          tokenHash: hashWorkspaceToken(presentedToken as string),
          workshopId: workshop.id,
          type: 'WORKSHOP',
        },
        select: { id: true, type: true, label: true, workshopId: true },
      });
    }
    if (!workspace) {
      admitNewWorkspace();
      const created = await this.workspaces.createWorkshop(
        workshop.id,
        workshop.title,
      );
      workspace = {
        id: created.id,
        type: created.type,
        label: created.label,
        workshopId: created.workshopId,
      };
      token = created.token;
    }

    const opened = await this.openSingleEntry(workspace, workshop.templates);
    return {
      workspace: {
        ...workspace,
        workshop: {
          code: displayWorkshopCode(workshop.code),
          title: workshop.title,
          readOnly: false,
        },
      },
      token: token as string,
      workflow: opened?.workflow ?? null,
      autoStarted: opened?.created ?? false,
    };
  }

  /** The participant's view of their workshop (SPEC-0022/FR-008). */
  async current(workspace: ResolvedWorkspace, now: Date = new Date()) {
    const workshop = await this.workshopOf(workspace);
    const [availability, copies] = await Promise.all([
      this.readiness.startable(workshop.templates),
      this.copiesOf(workspace.id, workshop.templates),
    ]);

    return {
      workshop: {
        code: displayWorkshopCode(workshop.code),
        title: workshop.title,
        readOnly: isWorkshopReadOnly(workshop, now),
      },
      entries: workshop.templates.map((entry) => {
        const available = availability.get(entry.id);
        return {
          id: entry.id,
          name: entry.template.name,
          description: entry.template.description,
          category: entry.template.category,
          tags: entry.template.tags,
          mode: entryMode(entry),
          revision: available?.ok ? available.revision : null,
          available: available?.ok ?? false,
          unavailableReason:
            available && !available.ok ? available.reason : null,
          myWorkflowId: copies.get(entry.templateId)?.id ?? null,
        };
      }),
    };
  }

  /** The content an entry would hand out, for the structure preview. */
  async structure(workspace: ResolvedWorkspace, entryId: string) {
    const entry = await this.entryOf(workspace, entryId);
    const resolution = await this.workshops.resolveEntryRevision(entry);
    if (!resolution.ok) throw this.entryUnavailable(resolution.reason);
    return {
      entryId: entry.id,
      name: resolution.revision.name,
      revision: resolution.revision.revision,
      content: resolution.revision.content,
    };
  }

  /**
   * Opens the participant's copy of an entry, creating it on first start (FR-009).
   *
   * The copy is the oldest workflow of the workspace made from the entry's template.
   * Two starts racing each other both create one, then both converge on the oldest and
   * the loser removes its own: no lock, and a double click or an auto-start racing a
   * manual start still ends with one copy.
   */
  async start(
    workspace: ResolvedWorkspace,
    entryId: string,
  ): Promise<{ workflow: WorkflowRef; created: boolean }> {
    const entry = await this.entryOf(workspace, entryId);
    const existing = await this.oldestCopy(workspace.id, entry.templateId);
    if (existing) return { workflow: existing, created: false };

    const resolution = await this.workshops.resolveEntryRevision(entry);
    if (!resolution.ok) throw this.entryUnavailable(resolution.reason);
    const { revision } = resolution;
    const made = await this.workflows.createFromTemplate(workspace, {
      templateId: revision.templateId,
      revisionId: revision.id,
      revision: revision.revision,
      name: revision.name,
      content: revision.content,
      contentSchema: revision.contentSchema,
    });

    const oldest = await this.oldestCopy(workspace.id, entry.templateId);
    if (oldest && oldest.id !== made.id) {
      await this.prisma.workflow.deleteMany({
        where: { id: made.id, workspaceId: workspace.id },
      });
      return { workflow: oldest, created: false };
    }
    return { workflow: this.ref(made), created: true };
  }

  /**
   * A workshop with a single entry skips the overview (FR-007): a fresh workspace gets
   * the entry started, a returning participant gets their copy back. A workspace that
   * holds other work but no copy of the entry is left on the overview.
   */
  private async openSingleEntry(
    workspace: ResolvedWorkspace,
    entries: EntryRow[],
  ): Promise<{ workflow: WorkflowRef; created: boolean } | null> {
    if (entries.length !== 1) return null;
    const [only] = entries;
    const count = await this.prisma.workflow.count({
      where: { workspaceId: workspace.id },
    });
    if (count > 0) {
      const copy = await this.oldestCopy(workspace.id, only.templateId);
      return copy ? { workflow: copy, created: false } : null;
    }
    try {
      return await this.start(workspace, only.id);
    } catch (error) {
      this.logger.warn(
        `Could not start the only template of workspace ${workspace.id}: ${String(error)}`,
      );
      return null;
    }
  }

  private async workshopOf(workspace: ResolvedWorkspace) {
    if (workspace.type !== 'WORKSHOP' || !workspace.workshopId) {
      throw new ForbiddenException({
        code: 'not_a_workshop_workspace',
        message: 'This workspace does not belong to a workshop.',
      });
    }
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: workspace.workshopId },
      select: {
        code: true,
        title: true,
        status: true,
        expiresAt: true,
        templates: { select: ENTRY_SELECT, orderBy: { position: 'asc' } },
      },
    });
    if (!workshop) throw this.entryNotFound();
    return workshop;
  }

  /** An entry of the caller's own workshop, or not found (FR-010). */
  private async entryOf(
    workspace: ResolvedWorkspace,
    entryId: string,
  ): Promise<EntryRow> {
    const workshop = await this.workshopOf(workspace);
    const entry = workshop.templates.find((item) => item.id === entryId);
    if (!entry) throw this.entryNotFound();
    return entry;
  }

  private async oldestCopy(
    workspaceId: string,
    templateId: string,
  ): Promise<WorkflowRef | null> {
    return this.prisma.workflow.findFirst({
      where: { workspaceId, sourceTemplateId: templateId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: WORKFLOW_REF_SELECT,
    });
  }

  private async copiesOf(
    workspaceId: string,
    entries: EntryRow[],
  ): Promise<Map<string, WorkflowRef>> {
    const rows = await this.prisma.workflow.findMany({
      where: {
        workspaceId,
        sourceTemplateId: { in: entries.map((entry) => entry.templateId) },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { ...WORKFLOW_REF_SELECT, sourceTemplateId: true },
    });
    const copies = new Map<string, WorkflowRef>();
    for (const row of rows)
      if (row.sourceTemplateId && !copies.has(row.sourceTemplateId))
        copies.set(row.sourceTemplateId, this.ref(row));
    return copies;
  }

  private ref(workflow: WorkflowRef | WorkflowSummary): WorkflowRef {
    return {
      id: workflow.id,
      name: workflow.name,
      slug: workflow.slug,
      version: workflow.version,
    };
  }

  private entryNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'workshop_entry_not_found',
      message: 'This workshop template does not exist.',
    });
  }

  private entryUnavailable(reason: string): NotFoundException {
    return new NotFoundException({
      code: 'workshop_entry_unavailable',
      message: reason,
    });
  }
}
