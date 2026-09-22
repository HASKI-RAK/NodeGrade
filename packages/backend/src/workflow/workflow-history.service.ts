import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { positiveNumber } from '../common/env.js';
import { PrismaService } from '../prisma.service.js';

/** Newest snapshots kept per workflow (SPEC-0021/FR-005). */
export const DEFAULT_HISTORY_LIMIT = 20;

/**
 * How long one snapshot stands for the edits that follow it (SPEC-0021/FR-001).
 *
 * The editor autosaves after 1.5 s of idling, so snapshotting every save would store a
 * row per typed widget value and push anything older than a minute out of the cap. The
 * window turns that stream into checkpoints: the first save after the window has passed
 * captures what the graph looked like before this stretch of editing.
 */
export const DEFAULT_SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;

/** Why a state was captured. Rendered by the client, never shown as-is. */
export const CAPTURE_REASONS = ['save', 'reset', 'restore'] as const;
export type CaptureReason = (typeof CAPTURE_REASONS)[number];

/** The workflow state a snapshot preserves. */
export type CapturedState = {
  version: number;
  name: string;
  content: string;
  contentSchema: number;
};

export type WorkflowVersionSummary = {
  id: string;
  version: number;
  name: string;
  reason: CaptureReason;
  nodeCount: number;
  createdAt: Date;
};

const SUMMARY_SELECT = {
  id: true,
  version: true,
  name: true,
  reason: true,
  nodeCount: true,
  createdAt: true,
} as const;

const isCaptureReason = (value: string): value is CaptureReason =>
  (CAPTURE_REASONS as readonly string[]).includes(value);

/** Unparseable content is still worth keeping; it just has no count to show. */
const countNodes = (content: string): number => {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) return 0;
    const nodes = (parsed as { nodes?: unknown }).nodes;
    return Array.isArray(nodes) ? nodes.length : 0;
  } catch {
    return 0;
  }
};

/**
 * Workflow version history: what "undo my last hour" reads and writes (SPEC-0021).
 *
 * Every snapshot holds a state the workflow has already left, so the live row and the
 * history never overlap. Reads and deletes carry the workspace next to the id, the way
 * `WorkflowService` does: a version id from a URL is not a credential (ADR-0001).
 */
@Injectable()
export class WorkflowHistoryService {
  private readonly logger = new Logger(WorkflowHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get limit(): number {
    return positiveNumber(
      process.env.WORKFLOW_HISTORY_LIMIT,
      DEFAULT_HISTORY_LIMIT,
    );
  }

  private get intervalMs(): number {
    return positiveNumber(
      process.env.WORKFLOW_HISTORY_INTERVAL_MS,
      DEFAULT_SNAPSHOT_INTERVAL_MS,
    );
  }

  /**
   * Whether an ordinary save should capture the state it is about to replace.
   *
   * Asked before the content is read rather than after: the check costs an indexed
   * lookup of one timestamp, while the answer saves reading — and storing — a 30 KB
   * graph on every autosave.
   */
  async isDue(workflowId: string, now: Date = new Date()): Promise<boolean> {
    const latest = await this.prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return true;
    return now.getTime() - latest.createdAt.getTime() >= this.intervalMs;
  }

  /**
   * Records a state and trims the workflow's history to the newest `limit`.
   *
   * Never throws: history is a safety net, and a save, reset or restore that the user
   * asked for must not fail because the net could not be woven (NFR-001).
   */
  async capture(
    workflowId: string,
    state: CapturedState,
    reason: CaptureReason = 'save',
  ): Promise<void> {
    try {
      await this.prisma.workflowVersion.create({
        data: {
          workflowId,
          version: state.version,
          name: state.name,
          content: state.content,
          contentSchema: state.contentSchema,
          reason,
          nodeCount: countNodes(state.content),
        },
      });
      await this.trim(workflowId);
    } catch (error) {
      this.logger.error(
        `Could not capture version ${state.version} of workflow ${workflowId}`,
        error,
      );
    }
  }

  async list(
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowVersionSummary[]> {
    await this.assertWorkflow(workspaceId, workflowId);
    const rows = await this.prisma.workflowVersion.findMany({
      where: { workflowId },
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: this.limit,
    });
    return rows.map((row) => ({
      ...row,
      reason: isCaptureReason(row.reason) ? row.reason : 'save',
    }));
  }

  /** The stored graph, for a client that wants to look before it leaps. */
  async content(
    workspaceId: string,
    workflowId: string,
    versionId: string,
  ): Promise<WorkflowVersionSummary & { content: string }> {
    const row = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, workflowId, workflow: { workspaceId } },
      select: { ...SUMMARY_SELECT, content: true },
    });
    if (!row) throw this.notFound();
    return {
      ...row,
      reason: isCaptureReason(row.reason) ? row.reason : 'save',
    };
  }

  /**
   * Puts a stored state back (SPEC-0021/FR-003).
   *
   * The live state is captured first, so restoring is itself undoable — the action is
   * destructive of unsaved-elsewhere work, and a history that can only go one way is a
   * trap. No If-Match, for the reason `WorkflowService.reset` has none: the user has
   * just confirmed this in a dialog. The version still increments, so another open tab
   * collides on its next save rather than writing the old graph back over the restore.
   */
  async restore(
    workspaceId: string,
    workflowId: string,
    versionId: string,
  ): Promise<void> {
    const restored = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, workflowId, workflow: { workspaceId } },
      select: { version: true, content: true, contentSchema: true },
    });
    if (!restored) throw this.notFound();

    const live = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      select: {
        version: true,
        name: true,
        content: true,
        contentSchema: true,
      },
    });
    if (!live) throw this.workflowNotFound();

    await this.capture(workflowId, live, 'restore');

    const { count } = await this.prisma.workflow.updateMany({
      where: { id: workflowId, workspaceId },
      data: {
        content: restored.content,
        contentSchema: restored.contentSchema,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw this.workflowNotFound();

    this.logger.log(
      `Restored workflow ${workflowId} to version ${restored.version}`,
    );
  }

  async remove(
    workspaceId: string,
    workflowId: string,
    versionId: string,
  ): Promise<void> {
    const { count } = await this.prisma.workflowVersion.deleteMany({
      where: { id: versionId, workflowId, workflow: { workspaceId } },
    });
    if (count === 0) throw this.notFound();
  }

  /** Drops every stored state of one workflow, keeping the live one (FR-004). */
  async clear(workspaceId: string, workflowId: string): Promise<void> {
    await this.assertWorkflow(workspaceId, workflowId);
    await this.prisma.workflowVersion.deleteMany({ where: { workflowId } });
  }

  private async trim(workflowId: string): Promise<void> {
    const overflow = await this.prisma.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      skip: this.limit,
      select: { id: true },
    });
    if (overflow.length === 0) return;
    await this.prisma.workflowVersion.deleteMany({
      where: { id: { in: overflow.map((row) => row.id) }, workflowId },
    });
  }

  private async assertWorkflow(
    workspaceId: string,
    workflowId: string,
  ): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      select: { id: true },
    });
    if (!workflow) throw this.workflowNotFound();
  }

  private workflowNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'workflow_not_found',
      message: 'No such workflow in this workspace.',
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'workflow_version_not_found',
      message: 'No such version of this workflow.',
    });
  }
}
