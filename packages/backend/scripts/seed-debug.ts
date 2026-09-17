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
      templateId: template.id,
      templateRevisionId: revision.id,
      closedAt: null,
    },
    create: {
      code: 'WAVE2026',
      title: 'Debug workshop',
      status: 'PUBLISHED',
      templateId: template.id,
      templateRevisionId: revision.id,
      publishedAt: new Date(),
    },
  });
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

  // The conference smoke test walks the WAIE workshop, and the bundled seeder only runs
  // once the server is up — after this script. Installing the same bundled content here,
  // byte for byte, gives the browser suite a WAIE workshop on the very first boot; the
  // bootstrap seeder then recognises its own content hash and leaves the revision alone.
  const waieContent = JSON.stringify(waieAssessmentTemplate.content);
  const waieHash = createHash('sha256').update(waieContent, 'utf8').digest('hex');
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
      templateId: waieTemplate.id,
      templateRevisionId: waieRevision.id,
      closedAt: null,
    },
    create: {
      code: 'WAIE2026',
      title: 'WAIE free-text assessment workshop',
      status: 'PUBLISHED',
      templateId: waieTemplate.id,
      templateRevisionId: waieRevision.id,
      publishedAt: new Date(),
    },
  });

  console.log(
    `Seeded debug workshops ${workshop.code} and ${waieWorkshop.code}; browser workspace token ${token}`,
  );
} finally {
  await prisma.$disconnect();
}
