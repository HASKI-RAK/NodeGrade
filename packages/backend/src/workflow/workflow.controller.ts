import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentWorkspace,
  WorkspaceScoped,
} from '../workspace/decorators/current-workspace.decorator.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import {
  CreateFromTemplateDto,
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from './dto/workflow.dto.js';
import { parseIfMatch, versionToEtag } from './workflow-etag.js';
import type { WorkflowDetail, WorkflowSummary } from './workflow.service.js';
import { WorkflowService } from './workflow.service.js';

const serializeSummary = (workflow: WorkflowSummary) => ({
  id: workflow.id,
  name: workflow.name,
  slug: workflow.slug,
  version: workflow.version,
  createdAt: workflow.createdAt.toISOString(),
  updatedAt: workflow.updatedAt.toISOString(),
  publishedVersion: workflow.publishedVersion,
  publishedAt: workflow.publishedAt?.toISOString() ?? null,
  sourceTemplateId: workflow.sourceTemplateId,
  sourceTemplateRevisionId: workflow.sourceTemplateRevisionId,
});

const serializeDetail = (workflow: WorkflowDetail) => ({
  ...serializeSummary(workflow),
  content: workflow.content,
});

@Controller('workflows')
@WorkspaceScoped()
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Get()
  async list(@CurrentWorkspace() workspace: ResolvedWorkspace) {
    const workflows = await this.workflows.list(workspace.id);
    return { workflows: workflows.map(serializeSummary) };
  }

  @Get(':id')
  async get(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workflow = await this.workflows.get(workspace.id, id);
    response.setHeader('ETag', versionToEtag(workflow.version));
    return serializeDetail(workflow);
  }

  @Post()
  async create(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Body() body: CreateWorkflowDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workflow = await this.workflows.create(workspace, body);
    response.setHeader('ETag', versionToEtag(workflow.version));
    return serializeDetail(workflow);
  }

  /**
   * "Use template" (SPEC-0003/FR-006).
   *
   * Each call produces a distinct copy — repeated clicks make repeated workflows rather
   * than overwriting the first, which is the documented edge case and the safe reading
   * of an impatient double click.
   */
  @Post('from-template')
  async createFromTemplate(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Body() body: CreateFromTemplateDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workflow = await this.workflows.createFromTemplateSlug(
      workspace,
      body.templateSlug,
      body.name,
    );
    response.setHeader('ETag', versionToEtag(workflow.version));
    return serializeDetail(workflow);
  }

  /**
   * "Reset to template" (SPEC-0003/FR-008).
   *
   * Confirmation is the client's job (AC-003): a server-side confirmation step would
   * mean a second round trip and a token to carry between them, for a decision the user
   * has already made in a dialog.
   */
  @Post(':id/reset')
  async reset(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workflow = await this.workflows.reset(workspace.id, id);
    response.setHeader('ETag', versionToEtag(workflow.version));
    return serializeSummary(workflow);
  }

  /**
   * Save, with HTTP's own optimistic concurrency (ADR-0002).
   *
   * If-Match is mandatory rather than optional: an absent header is far more likely to be
   * a client that forgot than a caller genuinely asking to overwrite, and the cost of
   * guessing wrong is a participant's lost work.
   */
  @Put(':id')
  async update(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') id: string,
    @Body() body: UpdateWorkflowDto,
    @Headers('if-match') ifMatchHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ifMatch = parseIfMatch(ifMatchHeader);

    if (ifMatch.kind === 'absent') {
      throw new HttpException(
        {
          code: 'precondition_required',
          message:
            'An If-Match header carrying the loaded version is required to save.',
        },
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    if (ifMatch.kind === 'invalid') {
      throw new BadRequestException({
        code: 'if_match_malformed',
        message: 'The If-Match header is not a valid entity tag.',
      });
    }
    if (body.name === undefined && body.content === undefined) {
      throw new BadRequestException({
        code: 'nothing_to_update',
        message: 'Provide a name, content, or both.',
      });
    }

    const workflow = await this.workflows.update(
      workspace.id,
      id,
      ifMatch,
      body,
    );
    response.setHeader('ETag', versionToEtag(workflow.version));
    // Content is not echoed back: the caller just sent it, and a saved workflow is large.
    return serializeSummary(workflow);
  }

  @Post(':id/publish')
  async publish(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const workflow = await this.workflows.publish(workspace.id, id);
    response.setHeader('ETag', versionToEtag(workflow.version));
    return serializeSummary(workflow);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('id') id: string,
  ): Promise<void> {
    await this.workflows.remove(workspace.id, id);
  }
}
