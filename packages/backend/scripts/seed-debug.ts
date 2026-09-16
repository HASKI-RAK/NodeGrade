import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '../src/generated/prisma/client.js';

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

  console.log(
    `Seeded debug workshop ${workshop.code}; browser workspace token ${token}`,
  );
} finally {
  await prisma.$disconnect();
}
