import { Controller, Get, Param, Query } from '@nestjs/common';
import { TemplateQueryDto } from './dto/template.dto.js';
import { serializeRevision, serializeTemplate } from './template.serializer.js';
import { TemplateService } from './template.service.js';

/**
 * The template gallery as everyone sees it (SPEC-0003/FR-004, FR-016).
 *
 * Unauthenticated: a participant browses templates before they have done anything at
 * all, and published templates are public by definition. Nothing here can modify a
 * template — FR-014's restriction lives on the admin controller, not on a role check
 * scattered through read paths.
 */
@Controller('templates')
export class TemplateController {
  constructor(private readonly templates: TemplateService) {}

  @Get()
  async list(@Query() query: TemplateQueryDto) {
    const templates = await this.templates.listPublished(query.kind);
    return { templates: templates.map(serializeTemplate) };
  }

  /** Metadata plus the current revision's content, which is what a preview needs. */
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
   * This is what makes a workshop bound to revision R keep working after the template
   * is unpublished or deleted (FR-017a, AC-014a, AC-017).
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
