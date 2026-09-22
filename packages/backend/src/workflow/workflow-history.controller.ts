import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentWorkspace,
  WorkspaceScoped,
} from '../workspace/decorators/current-workspace.decorator.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import { versionToEtag } from './workflow-etag.js';
import type { WorkflowVersionSummary } from './workflow-history.service.js';
import { WorkflowHistoryService } from './workflow-history.service.js';
import { serializeDetail } from './workflow-serialize.js';
import { WorkflowService } from './workflow.service.js';

const serializeVersion = (version: WorkflowVersionSummary) => ({
  id: version.id,
  version: version.version,
  name: version.name,
  reason: version.reason,
  nodeCount: version.nodeCount,
  createdAt: version.createdAt.toISOString(),
});

/**
 * Version history (SPEC-0021/FR-003, FR-004, FR-006). The workflow id in the path is
 * only ever combined with the workspace the bearer token resolved to (ADR-0001).
 */
@Controller('workflows/:id/versions')
@WorkspaceScoped()
export class WorkflowHistoryController {
  constructor(
    private readonly history: WorkflowHistoryService,
    private readonly workflows: WorkflowService,
  ) {}

  @Get()
  async list(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
  ) {
    this.assertEditor(workspace);
    const versions = await this.history.list(workspace.id, workflowId);
    return { versions: versions.map(serializeVersion) };
  }

  @Get(':versionId')
  async get(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
    @Param('versionId') versionId: string,
  ) {
    this.assertEditor(workspace);
    const version = await this.history.content(
      workspace.id,
      workflowId,
      versionId,
    );
    return {
      version: { ...serializeVersion(version), content: version.content },
    };
  }

  /**
   * Returns the restored workflow in full, content included: the caller is about to
   * load it into the editor, and a second round trip would be a chance to load
   * something else.
   */
  @Post(':versionId/restore')
  async restore(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
    @Param('versionId') versionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertEditor(workspace);
    await this.history.restore(workspace.id, workflowId, versionId);
    const workflow = await this.workflows.get(workspace.id, workflowId);
    response.setHeader('ETag', versionToEtag(workflow.version));
    return serializeDetail(workflow);
  }

  @Delete(':versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
    @Param('versionId') versionId: string,
  ): Promise<void> {
    this.assertEditor(workspace);
    await this.history.remove(workspace.id, workflowId, versionId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
  ): Promise<void> {
    this.assertEditor(workspace);
    await this.history.clear(workspace.id, workflowId);
  }

  /**
   * LTI learners share the instructor's workspace under the published projection. They
   * read `publishedContent` and never edit, so a history of the instructor's drafts is
   * neither theirs to see nor theirs to restore (FR-007).
   */
  private assertEditor(workspace: ResolvedWorkspace): void {
    if (workspace.publishedProjection)
      throw new ForbiddenException({
        code: 'history_editor_only',
        message: 'Version history is available to the workflow editor only.',
      });
  }
}
