import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import {
  AdminTemplateQueryDto,
  CreateRevisionDto,
  CreateTemplateDto,
  SetPublishedDto,
} from './dto/template.dto.js';
import { serializeRevision, serializeTemplate } from './template.serializer.js';
import { TemplateService } from './template.service.js';

/**
 * Template administration (SPEC-0003/FR-014, FR-015).
 *
 * @Facilitator() on the controller rather than per route: every route here modifies or
 * exposes the canonical template set, and a guard someone has to remember to add to each
 * new route is a guard that will eventually be missing from one.
 */
@Controller('admin/templates')
@Facilitator()
export class AdminTemplateController {
  constructor(private readonly templates: TemplateService) {}

  @Get()
  async list(@Query() query: AdminTemplateQueryDto) {
    const templates = await this.templates.listAll(
      query.kind,
      query.includeDeleted ?? false,
    );
    return { templates: templates.map(serializeTemplate) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const template = await this.templates.findById(id, false);
    const revisions = await this.templates.listRevisions(id);
    return {
      template: serializeTemplate(template),
      revisions: revisions.map((revision) => serializeRevision(revision)),
    };
  }

  @Post()
  async create(@Body() body: CreateTemplateDto) {
    const { template, revision } = await this.templates.createTemplate({
      slug: body.slug,
      kind: body.kind,
      published: body.published,
      revision: {
        name: body.name,
        description: body.description,
        category: body.category,
        tags: body.tags,
        content: body.content,
        interfaces: body.interfaces,
      },
    });

    return {
      template: serializeTemplate(template),
      revision: serializeRevision(revision),
    };
  }

  /**
   * Modification is expressed as appending a revision, never as editing one (FR-003a).
   *
   * There is deliberately no PUT: an endpoint that looks like it edits a template in
   * place is an invitation to write code that does, and the whole reset-and-workshop
   * story depends on old revisions being byte-identical forever.
   */
  @Post(':id/revisions')
  async addRevision(@Param('id') id: string, @Body() body: CreateRevisionDto) {
    const revision = await this.templates.addRevision(id, {
      name: body.name,
      description: body.description,
      category: body.category,
      tags: body.tags,
      content: body.content,
      interfaces: body.interfaces,
    });
    return { revision: serializeRevision(revision) };
  }

  @Post(':id/published')
  async setPublished(@Param('id') id: string, @Body() body: SetPublishedDto) {
    const template = await this.templates.setPublished(id, body.published);
    return { template: serializeTemplate(template) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const template = await this.templates.softDelete(id);
    return { template: serializeTemplate(template) };
  }

  @Delete(':id/revisions/:revision')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRevision(
    @Param('id') id: string,
    @Param('revision', ParseIntPipe) revision: number,
  ): Promise<void> {
    await this.templates.deleteRevision(id, revision);
  }
}
