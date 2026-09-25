import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { WorkspaceScoped } from '../workspace/decorators/current-workspace.decorator.js';
import { serializeRevision, serializeTemplate } from './template.serializer.js';
import { TemplateService } from './template.service.js';

/**
 * The block library the editor's palette inserts from (SPEC-0003/FR-013).
 *
 * Workspace-scoped and blocks only (SPEC-0022/FR-014): workflow templates reach a
 * participant solely as entries of their workshop, so neither their grading content nor
 * the provider budget behind them is open to anyone who finds the URL. Nothing here can
 * modify a template — FR-014's restriction lives on the admin controller.
 */
@Controller('templates')
@WorkspaceScoped()
export class TemplateController {
  constructor(private readonly templates: TemplateService) {}

  @Get()
  async list() {
    const templates = await this.templates.listPublished('BLOCK');
    return { templates: templates.map(serializeTemplate) };
  }

  /** Metadata plus the current revision's content, which is what an insert needs. */
  @Get(':slug')
  async get(@Param('slug') slug: string) {
    const template = await this.templates.findBySlug(slug, true);
    if (template.kind !== 'BLOCK')
      throw new NotFoundException({
        code: 'template_not_found',
        message: 'Template not found.',
      });
    const revision = await this.templates.getCurrentRevision(template.id);

    return {
      template: serializeTemplate(template),
      revision: serializeRevision(revision, {
        includeContent: true,
        requiredNodeTypes: this.templates.requiredNodeTypes(revision.content),
      }),
    };
  }
}
