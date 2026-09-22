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
    await client.query('SELECT 1 FROM "WorkflowVersion" LIMIT 1');
    available = true;
  } catch {
    console.warn(
      `Integration database unavailable at ${url} or the WorkflowVersion table is missing; version history checks skipped.`,
    );
  }
});

afterAll(async () => {
  if (available) await client.end();
});

const insertVersion = (id: string, workflowId: string, version: number) =>
  client.query(
    `INSERT INTO "WorkflowVersion" (id, "workflowId", version, name, content, "contentSchema", reason, "nodeCount", "createdAt")
     VALUES ($1, $2, $3, 'A', '{"nodes":[]}', 2, 'save', 0, NOW())`,
    [id, workflowId, version],
  );

describe('Workflow version history (SPEC-0021/FR-005)', () => {
  it('goes with its workflow and with the workspace', async () => {
    if (!available) return;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO "Workspace" (id, type, "createdAt", "lastActiveAt") VALUES ('int-ver-ws', 'BROWSER', NOW(), NOW())`,
      );
      await client.query(
        `INSERT INTO "Workflow" (id, "workspaceId", slug, name, content, version, "contentSchema", "createdAt", "updatedAt")
         VALUES ('int-ver-wf-a', 'int-ver-ws', 'a', 'A', '{}', 1, 2, NOW(), NOW()),
                ('int-ver-wf-b', 'int-ver-ws', 'b', 'B', '{}', 1, 2, NOW(), NOW())`,
      );
      await insertVersion('int-ver-1', 'int-ver-wf-a', 1);
      await insertVersion('int-ver-2', 'int-ver-wf-b', 1);

      await client.query(`DELETE FROM "Workflow" WHERE id = 'int-ver-wf-a'`);
      const afterWorkflow = await client.query<{ id: string }>(
        `SELECT v.id FROM "WorkflowVersion" v
         JOIN "Workflow" w ON w.id = v."workflowId"
         WHERE w."workspaceId" = 'int-ver-ws' ORDER BY v.id`,
      );
      expect(afterWorkflow.rows.map((row) => row.id)).toEqual(['int-ver-2']);

      await client.query(`DELETE FROM "Workspace" WHERE id = 'int-ver-ws'`);
      const afterWorkspace = await client.query(
        `SELECT id FROM "WorkflowVersion" WHERE "workflowId" = 'int-ver-wf-b'`,
      );
      expect(afterWorkspace.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('refuses a version whose workflow is not in the database', async () => {
    if (!available) return;
    await client.query('BEGIN');
    try {
      await expect(
        insertVersion('int-ver-3', 'int-ver-missing', 1),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('keeps several captures of one workflow at the same version', async () => {
    if (!available) return;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO "Workspace" (id, type, "createdAt", "lastActiveAt") VALUES ('int-ver-ws2', 'BROWSER', NOW(), NOW())`,
      );
      await client.query(
        `INSERT INTO "Workflow" (id, "workspaceId", slug, name, content, version, "contentSchema", "createdAt", "updatedAt")
         VALUES ('int-ver-wf-c', 'int-ver-ws2', 'c', 'C', '{}', 4, 2, NOW(), NOW())`,
      );

      await insertVersion('int-ver-4', 'int-ver-wf-c', 4);
      await insertVersion('int-ver-5', 'int-ver-wf-c', 4);

      const rows = await client.query(
        `SELECT id FROM "WorkflowVersion" WHERE "workflowId" = 'int-ver-wf-c'`,
      );
      expect(rows.rowCount).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
