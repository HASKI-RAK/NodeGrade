import { Client } from 'pg';

const url =
  process.env.TEST_DATABASE_URL ??
  'postgresql://nodegrade:nodegrade@127.0.0.1:15432/nodegrade?schema=public';
let client: Client;
let available = false;

beforeAll(async () => {
  client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('SELECT 1 FROM "Run" LIMIT 1');
    available = true;
  } catch {
    console.warn(
      `Integration database unavailable at ${url} or the Run table is missing; run record checks skipped.`,
    );
  }
});

afterAll(async () => {
  if (available) await client.end();
});

const insertRun = (id: string, workspaceId: string, workflowId: string) =>
  client.query(
    `INSERT INTO "Run" (id, "workspaceId", "workflowId", outcome, answer, outputs, "startedAt", "finishedAt", "durationMs")
     VALUES ($1, $2, $3, 'COMPLETED', 'answer', '[]'::jsonb, NOW(), NOW(), 0)`,
    [id, workspaceId, workflowId],
  );

describe('Run records (SPEC-0020/FR-008)', () => {
  it('go with their workspace and with their workflow', async () => {
    if (!available) return;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO "Workspace" (id, type, "createdAt", "lastActiveAt") VALUES ('int-run-ws', 'BROWSER', NOW(), NOW())`,
      );
      await client.query(
        `INSERT INTO "Workflow" (id, "workspaceId", slug, name, content, version, "contentSchema", "createdAt", "updatedAt")
         VALUES ('int-run-wf-a', 'int-run-ws', 'a', 'A', '{}', 1, 2, NOW(), NOW()),
                ('int-run-wf-b', 'int-run-ws', 'b', 'B', '{}', 1, 2, NOW(), NOW())`,
      );
      await insertRun('int-run-1', 'int-run-ws', 'int-run-wf-a');
      await insertRun('int-run-2', 'int-run-ws', 'int-run-wf-b');

      await client.query(`DELETE FROM "Workflow" WHERE id = 'int-run-wf-a'`);
      const afterWorkflow = await client.query<{ id: string }>(
        `SELECT id FROM "Run" WHERE "workspaceId" = 'int-run-ws' ORDER BY id`,
      );
      expect(afterWorkflow.rows.map((row) => row.id)).toEqual(['int-run-2']);

      await client.query(`DELETE FROM "Workspace" WHERE id = 'int-run-ws'`);
      const afterWorkspace = await client.query(
        `SELECT id FROM "Run" WHERE "workspaceId" = 'int-run-ws'`,
      );
      expect(afterWorkspace.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('refuse a run whose workflow is not in the database', async () => {
    if (!available) return;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO "Workspace" (id, type, "createdAt", "lastActiveAt") VALUES ('int-run-ws2', 'BROWSER', NOW(), NOW())`,
      );
      await expect(
        insertRun('int-run-3', 'int-run-ws2', 'int-run-missing'),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
