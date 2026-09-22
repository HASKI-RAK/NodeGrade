import type { WorkflowDetail, WorkflowSummary } from './workflow.service.js';

/** The wire shape of a workflow. Shared so every route that returns one agrees. */
export const serializeSummary = (workflow: WorkflowSummary) => ({
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

export const serializeDetail = (workflow: WorkflowDetail) => ({
  ...serializeSummary(workflow),
  content: workflow.content,
});
