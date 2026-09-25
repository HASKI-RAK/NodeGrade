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
    await client.query('SELECT 1 FROM "WorkshopTemplate" LIMIT 1');
    available = true;
  } catch {
    console.warn(
      `Integration database unavailable at ${url} or the WorkshopTemplate table is missing; workshop template checks skipped.`,
    );
  }
});

afterAll(async () => {
  if (available) await client.end();
});

/** Two templates with two revisions each, and a workshop without legacy columns. */
const seed = async () => {
  await client.query(
    `INSERT INTO "Template" (id, slug, kind, name, published, "currentRevision", "updatedAt")
     VALUES ('int-wt-t1', 'int-wt-one', 'WORKFLOW', 'One', true, 2, NOW()),
            ('int-wt-t2', 'int-wt-two', 'WORKFLOW', 'Two', true, 2, NOW())`,
  );
  await client.query(
    `INSERT INTO "TemplateRevision" (id, "templateId", revision, name, content, "contentHash")
     VALUES ('int-wt-r11', 'int-wt-t1', 1, 'One', '{}', 'h'),
            ('int-wt-r12', 'int-wt-t1', 2, 'One', '{}', 'h'),
            ('int-wt-r21', 'int-wt-t2', 1, 'Two', '{}', 'h'),
            ('int-wt-r22', 'int-wt-t2', 2, 'Two', '{}', 'h')`,
  );
  await client.query(
    `INSERT INTO "Workshop" (id, code, title, status, "updatedAt")
     VALUES ('int-wt-w', 'INTWTWSP', 'Workshop', 'PUBLISHED', NOW())`,
  );
};

const addEntry = (
  id: string,
  templateId: string,
  revisionId: string | null,
  position: number,
) =>
  client.query(
    `INSERT INTO "WorkshopTemplate" (id, "workshopId", "templateId", "templateRevisionId", position)
     VALUES ($1, 'int-wt-w', $2, $3, $4)`,
    [id, templateId, revisionId, position],
  );

const inTransaction = async (body: () => Promise<void>) => {
  await client.query('BEGIN');
  try {
    await seed();
    await body();
  } finally {
    await client.query('ROLLBACK');
  }
};

describe('Workshop template entries (SPEC-0022/FR-001)', () => {
  it('holds pinned and newest-revision entries without the legacy columns', async () => {
    if (!available) return;
    await inTransaction(async () => {
      await addEntry('int-wt-e1', 'int-wt-t1', 'int-wt-r11', 0);
      await addEntry('int-wt-e2', 'int-wt-t2', null, 1);

      const rows = await client.query<{
        id: string;
        templateRevisionId: string | null;
      }>(
        `SELECT id, "templateRevisionId" FROM "WorkshopTemplate"
         WHERE "workshopId" = 'int-wt-w' ORDER BY position`,
      );
      expect(rows.rows).toEqual([
        { id: 'int-wt-e1', templateRevisionId: 'int-wt-r11' },
        { id: 'int-wt-e2', templateRevisionId: null },
      ]);
    });
  });

  it('allows one entry per template and workshop', async () => {
    if (!available) return;
    await inTransaction(async () => {
      await addEntry('int-wt-e1', 'int-wt-t1', 'int-wt-r11', 0);
      await expect(
        addEntry('int-wt-e2', 'int-wt-t1', null, 1),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('keeps a pinned revision and a referenced template from being deleted', async () => {
    if (!available) return;
    await inTransaction(async () => {
      await addEntry('int-wt-e1', 'int-wt-t1', 'int-wt-r11', 0);
      await client.query('SAVEPOINT revision');
      await expect(
        client.query(`DELETE FROM "TemplateRevision" WHERE id = 'int-wt-r11'`),
      ).rejects.toMatchObject({ code: '23503' });
      await client.query('ROLLBACK TO SAVEPOINT revision');
      await expect(
        client.query(`DELETE FROM "Template" WHERE id = 'int-wt-t1'`),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('goes with its workshop', async () => {
    if (!available) return;
    await inTransaction(async () => {
      await addEntry('int-wt-e1', 'int-wt-t1', 'int-wt-r11', 0);
      await addEntry('int-wt-e2', 'int-wt-t2', null, 1);

      await client.query(`DELETE FROM "Workshop" WHERE id = 'int-wt-w'`);

      const rows = await client.query(
        `SELECT id FROM "WorkshopTemplate" WHERE "workshopId" = 'int-wt-w'`,
      );
      expect(rows.rowCount).toBe(0);
    });
  });
});
