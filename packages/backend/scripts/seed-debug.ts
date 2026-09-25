import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { waieAssessmentTemplate } from '../src/template/bundled/waie-assessment.js';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for the debug seed');
}

const graph = await readFile(
  new URL('../../../tools/debug/demo-graph.json', import.meta.url),
  'utf8',
);
const token = `ngw_${Buffer.alloc(32, 1).toString('base64url')}`;
const tokenHash = createHash('sha256').update(token).digest('hex');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

/** Leaves the workshop with exactly one entry, pinned to the given revision (SPEC-0022). */
const pinOnlyEntry = async (
  workshopId: string,
  templateId: string,
  templateRevisionId: string,
) => {
  await prisma.workshopTemplate.deleteMany({
    where: { workshopId, templateId: { not: templateId } },
  });
  await prisma.workshopTemplate.upsert({
    where: { workshopId_templateId: { workshopId, templateId } },
    update: { templateRevisionId, position: 0 },
    create: { workshopId, templateId, templateRevisionId, position: 0 },
  });
};

try {
  const template = await prisma.template.upsert({
    where: { slug: 'debug-workflow' },
    update: { published: true, deletedAt: null },
    create: {
      slug: 'debug-workflow',
      kind: 'WORKFLOW',
      name: 'Debug workflow',
      description: 'Deterministic workflow for local and browser tests',
      published: true,
      currentRevision: 1,
    },
  });
  const revision = await prisma.templateRevision.upsert({
    where: {
      templateId_revision: { templateId: template.id, revision: 1 },
    },
    update: { content: graph },
    create: {
      templateId: template.id,
      revision: 1,
      origin: 'BUNDLED',
      name: 'Debug workflow',
      content: graph,
      contentHash: createHash('sha256').update(graph).digest('hex'),
    },
  });
  const workshop = await prisma.workshop.upsert({
    where: { code: 'WAVE2026' },
    update: {
      status: 'PUBLISHED',
      templateId: null,
      templateRevisionId: null,
      expiresAt: null,
      closedAt: null,
    },
    create: {
      code: 'WAVE2026',
      title: 'Debug workshop',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  await pinOnlyEntry(workshop.id, template.id, revision.id);
  const browser = await prisma.workspace.upsert({
    where: { tokenHash },
    update: { label: 'Debug browser workspace' },
    create: {
      type: 'BROWSER',
      label: 'Debug browser workspace',
      tokenHash,
    },
  });
  await prisma.workflow.upsert({
    where: { workspaceId_slug: { workspaceId: browser.id, slug: 'demo' } },
    update: { content: graph },
    create: {
      workspaceId: browser.id,
      slug: 'demo',
      name: 'Demo',
      content: graph,
      sourceTemplateId: template.id,
      sourceTemplateRevisionId: revision.id,
    },
  });
  const lti = await prisma.workspace.upsert({
    where: { ltiKey: 'debug|demo|1' },
    update: { label: 'Debug LTI workspace' },
    create: {
      type: 'LTI',
      label: 'Debug LTI workspace',
      ltiKey: 'debug|demo|1',
    },
  });
  await prisma.workflow.upsert({
    where: { workspaceId_slug: { workspaceId: lti.id, slug: 'demo' } },
    update: { content: graph, publishedContent: graph },
    create: {
      workspaceId: lti.id,
      slug: 'demo',
      name: 'LTI demo',
      content: graph,
      publishedContent: graph,
      publishedVersion: 1,
      publishedAt: new Date(),
    },
  });

  // The conference smoke test maps the canonical OpenRouter selection to the local fake
  // model. Its workshop stays pinned to this deterministic revision. The bootstrap seeder
  // may append the canonical bundled revision for gallery use after the server starts.
  const debugWaie = JSON.parse(
    JSON.stringify(waieAssessmentTemplate.content),
  ) as typeof waieAssessmentTemplate.content;
  for (const node of debugWaie.nodes) {
    if (node.type !== 'models/llm') continue;
    node.properties = {
      ...node.properties,
      value: 'nodegrade-deterministic',
      model: 'nodegrade-deterministic',
      model_ref: {
        providerKey: 'local',
        modelId: 'nodegrade-deterministic',
      },
      needs_model_selection: false,
    };
  }
  const waieContent = JSON.stringify(debugWaie);
  const waieHash = createHash('sha256')
    .update(waieContent, 'utf8')
    .digest('hex');
  const waieMetadata = {
    name: waieAssessmentTemplate.name,
    description: waieAssessmentTemplate.description,
    category: waieAssessmentTemplate.category,
    tags: waieAssessmentTemplate.tags,
  };
  const waieTemplate = await prisma.template.upsert({
    where: { slug: waieAssessmentTemplate.slug },
    update: { published: true, deletedAt: null },
    create: {
      slug: waieAssessmentTemplate.slug,
      kind: waieAssessmentTemplate.kind,
      published: true,
      currentRevision: 1,
      ...waieMetadata,
    },
  });
  const waieRevision = await prisma.templateRevision.upsert({
    where: {
      templateId_revision: { templateId: waieTemplate.id, revision: 1 },
    },
    update: { content: waieContent, contentHash: waieHash },
    create: {
      templateId: waieTemplate.id,
      revision: 1,
      origin: 'BUNDLED',
      content: waieContent,
      contentHash: waieHash,
      ...waieMetadata,
    },
  });
  const waieWorkshop = await prisma.workshop.upsert({
    where: { code: 'WAIE2026' },
    update: {
      status: 'PUBLISHED',
      templateId: null,
      templateRevisionId: null,
      expiresAt: null,
      closedAt: null,
    },
    create: {
      code: 'WAIE2026',
      title: 'WAIE free-text assessment workshop',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  await pinOnlyEntry(waieWorkshop.id, waieTemplate.id, waieRevision.id);

  // The deterministic worker doubles as the deployment default in the debug stack,
  // so graphs without an explicit model selection exercise the fallback path.
  await prisma.deploymentSettings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      defaultProviderKey: 'local',
      defaultModelId: 'nodegrade-deterministic',
    },
    update: {
      defaultProviderKey: 'local',
      defaultModelId: 'nodegrade-deterministic',
    },
  });

  console.log(
    `Seeded debug workshops ${workshop.code} and ${waieWorkshop.code}; browser workspace token ${token}`,
  );
} finally {
  await prisma.$disconnect();
}
