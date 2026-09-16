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
    await client.query('SELECT 1 FROM "Workspace" LIMIT 1');
    available = true;
  } catch {
    console.warn(
      `Integration database unavailable at ${url}; Wave 1 integration checks skipped.`,
    );
  }
});

afterAll(async () => {
  if (available) await client.end();
});

describe('Wave 1 database constraints', () => {
  it('permits the same workflow slug in separate workspaces', async () => {
    if (!available) return;
    await client.query('BEGIN');
    try {
      const first = await client.query<{ id: string }>(
        `INSERT INTO "Workspace" (id, type, "createdAt", "lastActiveAt") VALUES ('int-a', 'BROWSER', NOW(), NOW()), ('int-b', 'BROWSER', NOW(), NOW()) RETURNING id`,
      );
      expect(first.rowCount).toBe(2);
      await client.query(
        `INSERT INTO "Workflow" (id, "workspaceId", slug, name, content, version, "contentSchema", "createdAt", "updatedAt") VALUES ('int-wa', 'int-a', 'same', 'A', '{}', 1, 2, NOW(), NOW()), ('int-wb', 'int-b', 'same', 'B', '{}', 1, 2, NOW(), NOW())`,
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('supports atomic optimistic updates', async () => {
    if (!available) return;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO "Workspace" (id, type, "createdAt", "lastActiveAt") VALUES ('int-c', 'BROWSER', NOW(), NOW())`,
      );
      await client.query(
        `INSERT INTO "Workflow" (id, "workspaceId", slug, name, content, version, "contentSchema", "createdAt", "updatedAt") VALUES ('int-wc', 'int-c', 'one', 'One', '{}', 1, 2, NOW(), NOW())`,
      );
      const first = await client.query(
        `UPDATE "Workflow" SET version = version + 1 WHERE id = 'int-wc' AND version = 1`,
      );
      const stale = await client.query(
        `UPDATE "Workflow" SET version = version + 1 WHERE id = 'int-wc' AND version = 1`,
      );
      expect(first.rowCount).toBe(1);
      expect(stale.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
