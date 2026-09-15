import type { TemplateService } from './template.service.js';

type TemplateRow = Awaited<ReturnType<TemplateService['findById']>>;
type RevisionRow = Awaited<ReturnType<TemplateService['getRevision']>>;

export const serializeTemplate = (template: TemplateRow) => ({
  id: template.id,
  slug: template.slug,
  kind: template.kind,
  name: template.name,
  description: template.description,
  category: template.category,
  tags: template.tags,
  published: template.published,
  currentRevision: template.currentRevision,
  deletedAt: template.deletedAt?.toISOString() ?? null,
  updatedAt: template.updatedAt.toISOString(),
});

/**
 * Content is opt-in. A gallery listing fetches dozens of templates and needs only
 * metadata; shipping every canvas with it would make browsing cost megabytes.
 */
export const serializeRevision = (
  revision: Omit<RevisionRow, 'content'> & { content?: string },
  options: { includeContent?: boolean; requiredNodeTypes?: string[] } = {},
) => ({
  id: revision.id,
  templateId: revision.templateId,
  revision: revision.revision,
  origin: revision.origin,
  name: revision.name,
  description: revision.description,
  category: revision.category,
  tags: revision.tags,
  interfaces: revision.interfaces ?? null,
  contentSchema: revision.contentSchema,
  createdAt: revision.createdAt.toISOString(),
  ...(options.includeContent ? { content: revision.content } : {}),
  ...(options.requiredNodeTypes
    ? { requiredNodeTypes: options.requiredNodeTypes }
    : {}),
});
