import { Controller, Get, Param, Query } from '@nestjs/common';
import { WorkspaceScoped } from '../workspace/decorators/current-workspace.decorator.js';
import { TemplateQueryDto } from './dto/template.dto.js';
import { serializeRevision, serializeTemplate } from './template.serializer.js';
import { TemplateService } from './template.service.js';

/**
 * The template gallery and the block library (SPEC-0003/FR-004, FR-013, FR-016).
 *
 * Workspace-scoped for both kinds (SPEC-0022/FR-014, ADR-0011): a browser holds a
 * workspace from its first visit, so requiring the credential costs a participant
 * nothing and keeps grading content behind something that is at least rate-limited.
 * Workflow templates are what the gallery offers "Use template" for; block templates
 * are what the editor palette inserts. Nothing here can modify a template — FR-014's
 * restriction lives on the admin controller.
 */
@Controller('templates')
@WorkspaceScoped()
export class TemplateController {
  constructor(private readonly templates: TemplateService) {}

  /** Published templates; `kind` narrows to one kind and is omitted for both. */
  @Get()
  async list(@Query() query: TemplateQueryDto) {
    const templates = await this.templates.listPublished(query.kind);
    return { templates: templates.map(serializeTemplate) };
  }

  /** Metadata plus the current revision's content, which is what a preview or an insert needs. */
  @Get(':slug')
  async get(@Param('slug') slug: string) {
    const template = await this.templates.findBySlug(slug, true);
    const revision = await this.templates.getCurrentRevision(template.id);

    return {
      template: serializeTemplate(template),
      revision: serializeRevision(revision, {
        includeContent: true,
        requiredNodeTypes: this.templates.requiredNodeTypes(revision.content),
      }),
    };
  }

  /**
   * A pinned revision, resolvable regardless of the template's current visibility.
   *
   * This is what lets a workflow created from revision R show what it was reset to after
   * the template is unpublished or deleted (FR-017a, AC-014a, AC-017).
   */
  @Get('revisions/:revisionId')
  async revision(@Param('revisionId') revisionId: string) {
    const revision = await this.templates.getRevision(revisionId);
    return {
      revision: serializeRevision(revision, {
        includeContent: true,
        requiredNodeTypes: this.templates.requiredNodeTypes(revision.content),
      }),
    };
  }
}
