import { Injectable, Logger } from '@nestjs/common';
import type { WorkspaceType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma.service.js';
import {
  IssuedWorkspaceToken,
  hashWorkspaceToken,
  isWorkspaceTokenShape,
  issueWorkspaceToken,
} from './workspace-token.js';

/** Bounds how often a request may write to a workspace row (ADR-0001 note on hot rows). */
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type ResolvedWorkspace = {
  id: string;
  type: WorkspaceType;
  label: string | null;
  workshopId: string | null;
  publishedProjection?: boolean;
};

export type CreatedWorkspace = ResolvedWorkspace & {
  createdAt: Date;
  /** Returned exactly once, at creation. */
  token: string;
};

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Establishes the ephemeral workspace an anonymous participant gets on first use
   * (SPEC-0004/FR-003). The token is the only way back into it: nothing else identifies
   * the caller, and only its hash is stored.
   */
  async createBrowser(label?: string): Promise<CreatedWorkspace> {
    const issued = issueWorkspaceToken();
    const workspace = await this.create('BROWSER', issued, { label });

    this.logger.log(`Created BROWSER workspace ${workspace.id}`);
    return { ...workspace, token: issued.token };
  }

  async createWorkshop(
    workshopId: string,
    label?: string,
  ): Promise<CreatedWorkspace> {
    const issued = issueWorkspaceToken();
    const workspace = await this.create('WORKSHOP', issued, {
      label,
      workshopId,
    });

    this.logger.log(`Created WORKSHOP workspace ${workspace.id}`);
    return { ...workspace, token: issued.token };
  }

  async resolveByLtiKey(
    ltiKey: string,
    now: Date = new Date(),
  ): Promise<ResolvedWorkspace | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { ltiKey },
      select: {
        id: true,
        type: true,
        label: true,
        workshopId: true,
        lastActiveAt: true,
      },
    });
    if (!workspace || workspace.type !== 'LTI') return null;

    await this.touch(workspace.id, workspace.lastActiveAt, now);
    return {
      id: workspace.id,
      type: workspace.type,
      label: workspace.label,
      workshopId: workspace.workshopId,
    };
  }

  private async create(
    type: WorkspaceType,
    issued: IssuedWorkspaceToken,
    extra: { label?: string; workshopId?: string; ltiKey?: string } = {},
  ) {
    return this.prisma.workspace.create({
      data: {
        type,
        tokenHash: issued.tokenHash,
        label: extra.label ?? null,
        workshopId: extra.workshopId ?? null,
        ltiKey: extra.ltiKey ?? null,
      },
      select: {
        id: true,
        type: true,
        label: true,
        workshopId: true,
        createdAt: true,
      },
    });
  }

  /**
   * The single point where a caller's claim becomes an authorization decision
   * (SPEC-0004/FR-004). Nothing else may derive a workspace from request input.
   */
  async resolveByToken(
    token: string | undefined,
    now: Date = new Date(),
  ): Promise<ResolvedWorkspace | null> {
    if (!isWorkspaceTokenShape(token)) return null;

    const workspace = await this.prisma.workspace.findUnique({
      where: { tokenHash: hashWorkspaceToken(token as string) },
      select: {
        id: true,
        type: true,
        label: true,
        workshopId: true,
        lastActiveAt: true,
      },
    });
    if (!workspace) return null;

    await this.touch(workspace.id, workspace.lastActiveAt, now);

    // lastActiveAt is read for the touch decision only; it is not part of the identity a
    // handler gets to see.
    return {
      id: workspace.id,
      type: workspace.type,
      label: workspace.label,
      workshopId: workspace.workshopId,
    };
  }

  /**
   * Records activity for retention (SPEC-0004/FR-010), at most once per interval.
   *
   * Conditional on lastActiveAt rather than read-then-write: with 50 participants
   * autosaving, an unconditional write per request would make every workspace row a
   * contention point for no added precision.
   */
  async touch(id: string, lastActiveAt: Date, now: Date): Promise<void> {
    if (now.getTime() - lastActiveAt.getTime() < TOUCH_INTERVAL_MS) return;

    await this.prisma.workspace.updateMany({
      where: {
        id,
        lastActiveAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) },
      },
      data: { lastActiveAt: now },
    });
  }
}
