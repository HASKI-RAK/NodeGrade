import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  CurrentWorkspace,
  WorkspaceScoped,
} from '../workspace/decorators/current-workspace.decorator.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import { ListRunsQueryDto, SetRunReviewDto } from './dto/run.dto.js';
import {
  DEFAULT_LIST_LIMIT,
  type RunDetail,
  type RunSummary,
  RunService,
} from './run.service.js';

const serializeSummary = (run: RunSummary) => ({
  id: run.id,
  outcome: run.outcome,
  answerExcerpt: run.answerExcerpt,
  flagged: run.flagged,
  flagReason: run.flagReason,
  needsReview: run.needsReview,
  score: run.score,
  submittedBy: run.submittedBy,
  reviewedAt: run.reviewedAt?.toISOString() ?? null,
  reviewNote: run.reviewNote,
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt.toISOString(),
  durationMs: run.durationMs,
});

const serializeDetail = (run: RunDetail) => ({
  ...serializeSummary(run),
  answer: run.answer,
  outputs: run.outputs,
  errorMessage: run.errorMessage,
});

/**
 * The Submissions inbox (SPEC-0020/FR-006, FR-007). The workflow id in the path is
 * only ever combined with the workspace the bearer token resolved to.
 */
@Controller('workflows/:id/runs')
@WorkspaceScoped()
export class RunController {
  constructor(private readonly runs: RunService) {}

  @Get()
  async list(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
    @Query() query: ListRunsQueryDto,
  ) {
    this.assertEditor(workspace);
    const { runs, summary } = await this.runs.list(
      workspace.id,
      workflowId,
      query.filter ?? 'all',
      query.limit ?? DEFAULT_LIST_LIMIT,
    );
    return { runs: runs.map(serializeSummary), summary };
  }

  @Get(':runId')
  async get(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
    @Param('runId') runId: string,
  ) {
    this.assertEditor(workspace);
    const run = await this.runs.get(workspace.id, workflowId, runId);
    return { run: serializeDetail(run) };
  }

  @Patch(':runId/review')
  async review(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') workflowId: string,
    @Param('runId') runId: string,
    @Body() body: SetRunReviewDto,
  ) {
    this.assertEditor(workspace);
    const run = await this.runs.setReview(workspace.id, workflowId, runId, {
      reviewed: body.reviewed,
      note: body.note,
    });
    return { run: serializeSummary(run) };
  }

  /**
   * LTI learners share the instructor's workspace under the published projection;
   * their runs are recorded for the instructor, never listed back to them (FR-007).
   */
  private assertEditor(workspace: ResolvedWorkspace): void {
    if (workspace.publishedProjection)
      throw new ForbiddenException({
        code: 'runs_editor_only',
        message: 'Submissions are visible to the workflow editor only.',
      });
  }
}
