# Wave 1 — Workshop foundation

> Working plan for the first wave of workshop features. Written 2026-09-15 during
> planning, kept updated as slices merge. Status table is in [Slices](#slices);
> merged work is recorded with its merge commit.

## Progress at a glance

_Last updated: 2026-09-16._

| Slice | Branch | Merge commit | State |
|---|---|---|---|
| 1 | `agent/backend-foundations` | `d993aab` | Merged |
| 2 | `agent/workspace-schema` | `2198e87` | Merged |
| – | `agent/debug-generated-perms` | `d3aad74` | Merged |
| 3 | `agent/admin-auth` | `bea339a` | Merged |
| 4a | `agent/workspace-core` | `38b71df` | Merged |
| 5 | `agent/template-subsystem` | `e5f208b` | Merged |
| 4b, 6, F1–F5, 7, 8, 9 | `agent/wave1-completion` | pending merge | Complete |

Baseline on `dev` after slice 5: backend 32 suites / 265 tests, frontend 3 files /
8 tests, `tsc --noEmit` clean, `build` clean, `lint:check` clean.

`origin/dev` is at `38b71df`; slice 5 (`b002441` + `e5f208b`) is not pushed yet.
Branches `agent/backend-foundations`, `agent/workspace-schema`,
`agent/debug-generated-perms` and `agent/admin-auth` still exist locally.

### Local database caveat

The Postgres on `127.0.0.1:5432` is **two migrations behind**
(`20260915163314_add_workspace_model`, `20260915163315_backfill_workflows_from_graphs`).
Slice verification so far has used throwaway containers on scratch ports rather than
applying migrations to it. Apply them deliberately when you want the local stack to
run wave-1 code.

### Worktree setup checklist

Per `AGENTS.md`, each slice is a worktree. A fresh one needs all of:

```bash
git worktree add ../NodeGrade-<task> -b agent/<task> dev   # off LOCAL dev
cp /home/david/dev/NodeGrade/packages/backend/.env packages/backend/.env
yarn install
yarn prisma generate                      # fails without .env: DATABASE_URL unresolvable
yarn workspace @haski/ta-lib run build    # backend imports its dist/
```

`packages/backend/.env` and `packages/backend/src/generated` are both gitignored, so
neither comes across with the worktree.

---

## Context

NodeGrade is being presented at the WAIE workshop, where 20–50 concurrent anonymous
participants adapt a preconfigured assessment workflow for ~35 minutes. `specs/` holds
15 drafted specifications describing what that requires. The product could not support it
when this plan was written, and the reason was structural rather than cosmetic:

- **Graphs have no owner.** `packages/backend/prisma/schema.prisma` had one working
  model, `Graph { id, path @unique, graph String }`. Identity was the editor URL
  pathname. `GET /graphs` returned every stored graph to anyone, `saveGraph` upserted by
  path, and there was no authentication or authorization anywhere in the backend.
- **No template concept.** Starting from a prepared workflow meant importing a JSON
  file, which calls `lgraph.configure()` and replaces everything.
- **No workshop concept.** Spec review already caught this: workshop codes were
  specified as identifying "exactly one workshop" while no Workshop entity existed.
- **`/` is a placeholder** — an inline `<div>Welcome to the Task Editor</div>` at
  `packages/frontend/src/pages/App.tsx:48`.

Wave 1 builds the foundation and proves it with one vertical slice: a facilitator
publishes a workshop bound to a template revision, a participant joins by code, lands in
their own copy in their own workspace, edits it, and their work survives a reload.
Editor shell redesign (SPEC-0005), trace panel (SPEC-0006) and WAIE content (SPEC-0007)
are wave 2.

### Scope decisions taken

| Decision | Choice |
|---|---|
| Wave reach | Foundation (SPEC-0013, 0004, 0003, 0014) + minimum frontend for the slice |
| Old path-based API | Removed in the same wave, frontend updated in lockstep |
| LTI | Kept working; launches map to LTI-type workspaces (SPEC-0004/FR-008) |
| LLM providers | Data model + content shape only. AI SDK execution + admin UI are wave 2 |
| Deliverables | This plan plus ADRs in `docs/adr/` |

### Baseline verified at planning time

Both packages typechecked clean. `yarn test` = 11 suites / 41 tests. Frontend `test:run` =
3 files / 8 tests, and was **not** in root `yarn test`.

---

## 🔴 Escalations — read these first

Three items that are not feature work and that wave 1 makes worse if ignored.

### E1 — LTI launches have no signature verification, and this wave raises the stakes

`LtiBasicLaunchValidationPipe` (`src/lti/pipes/lti-validation.pipe.ts`) is a **shape check
only** — it verifies ~30 fields are present and typed, and never validates the OAuth 1.0a
signature. Today the blast radius is "anyone can POST a fake launch and receive a cookie".

After wave 1, LTI workspaces hold **persistent per-context content**. An unsigned POST plus
a guessed `context_id` / `resource_link_id` would read or write any course's workflows.
SPEC-0013 hardens the admin surface; nothing in the spec set hardens this.

**Recommendation: add OAuth 1.0a HMAC-SHA1 verification in wave 1.** Roughly 40 lines plus
an `LTI_CONSUMER_KEY` / `LTI_CONSUMER_SECRET` env pair. I would put this above the feature
work in priority. Resolved as open question #2: implement, but gate on the secret being set.

**Status: still open. Lands with slice 4b.**

### E2 — `POST /benchmark/run` is unauthenticated arbitrary graph execution

It executes any stored graph against the LLM worker with no auth. Once SPEC-0012's shared
OpenRouter key lands, that is an unmetered spend endpoint open to the internet. Wave 1
changes it to `{ workflowId }` and puts it behind `@Facilitator()`.

**Status: still open. Closed by slice 8.**

### E3 — `POST /api/workspaces` is unauthenticated and uncapped

Anyone can mint unlimited workspaces and workflows. No spec covers it. Per-IP throttle
(via the throttler being added anyway) plus a hard cap of ~50 workflows per BROWSER
workspace.

**Status: closed in slice 4a.** `WorkspaceCreationThrottle` (30 per IP per hour,
`WORKSPACE_CREATE_MAX` / `WORKSPACE_CREATE_WINDOW_MS`) and `assertRoom()` enforcing
`WORKSPACE_MAX_WORKFLOWS` (default 50, LTI workspaces exempt).

---

## Bugs found while planning, in code the wave depends on

| Where | What | Status |
|---|---|---|
| `src/utils/websocket-cookie.adapter.ts:79-85` | `parseCookies` does `split('=')` and keeps the pair only `if (parts.length === 2)`. **Any cookie value containing `=` is silently dropped** — which is exactly the shape of base64 session and workspace tokens. Fix with `parse()` from the `cookie` package, already a dependency and imported by nothing. | Slice 4b |
| `packages/backend/Dockerfile:52` | The only place migrations run in production is the `CMD`. The runtime stage copies `dist`, `prisma/`, `prisma.config.ts` — **not `scripts/`**. A `scripts/*.ts` backfill would not exist in the production image. | Designed around (ADR-0004) |
| `src/lti/lti.controller.ts:22`, `lti.service.ts:14` | Both `JSON.stringify(payload)` into a log line, which includes `lis_person_contact_email_primary` and full names. Violates SPEC-0013/FR-008. | Fixed in slice 1 |
| `packages/frontend/public/config/env.production.json` | Production config sets `"API": "http://localhost:5000/"`, plus a `WS` key nothing reads. | Fixed in slice 1 |
| `packages/frontend/src/pages/lti/LtiRegister.tsx:19` | Reads `getConfig().LTI_REGISTER`, a key in **neither** env JSON — it fetches the literal string `"undefined?openid_configuration=…"`. | Fixed in slice 1 |
| `packages/backend/package.json:18` | `lint` is `eslint … --fix` — it mutates files, so it cannot gate a PR, and it lints the committed Prisma client under `src/generated/prisma`. (It rewrote 9 files when I ran it for a baseline.) | Fixed in slice 1 (`lint:check`) |
| `packages/frontend/src/hooks/useEditorUI.ts:42` | `checkSize` sets `height: window.outerWidth`. SPEC-0005/FR-010. | Slice F1 |

---

## Architectural decisions

Each gets an ADR in `docs/adr/` (the directory does not exist; `docs/` holds only
`debugging.md` and this plan). Start with `0000-record-architecture-decisions.md`,
MADR-lite. **The ADRs are still unwritten — they are a slice 9 deliverable.**

### ADR-0001 — The workspace access token is the only authorization primitive

A workspace id is not a credential (SPEC-0004/FR-004, AC-007). Token =
`randomBytes(32)` base64url, prefixed `ngw_`, returned **once**; only `sha256(token)` hex
is stored, with a unique index for single-read lookup. SHA-256 rather than bcrypt/argon2
is correct here: those exist to slow guessing of *low-entropy* secrets, and would add
~100 ms to every autosave and every socket handshake for no gain against 256 bits.

Transport: `Authorization: Bearer` on HTTP — which removes CSRF from the entire
participant surface — and `io(url, { auth: { workspaceToken } })` on Socket.IO, which
Socket.IO re-sends on every reconnect.

**Resolution writes to `socket.data.workspace`, never to `socket.handshake.auth`.** The
adapter today writes `handshake.auth.parsedCookies`, mixing server-derived facts into the
client-supplied input object. Keeping "what the client claimed" and "what the server
derived" in separate places is precisely what prevents the AC-007 IDOR failure mode.

Resolution happens in the **handshake middleware**, not `handleConnection` — Nest cannot
cleanly reject in the latter, while `next(new Error(...))` is Socket.IO's documented
rejection path. Connections with *no* credential are still accepted (the frontend connects
before bootstrapping, and an LTI student has a cookie but no token); only an *invalid*
token rejects.

**Implemented for HTTP in slice 4a** (`src/workspace/workspace-token.ts`,
`WorkspaceGuard`, `@WorkspaceScoped()`). The socket half lands with slice 4b.

### ADR-0002 — Workflow save/load move to REST with `If-Match`; the socket keeps execution

| REST | WebSocket |
|---|---|
| workspaces, workflow CRUD, templates, workshops, admin | `runGraph` + the whole trace stream |

`saveGraph` / `loadGraph` / `graphSaved` / `graphLoaded` are removed.
`runGraph` becomes `{ workflowId, answer, graph?, xapi? }` — `graph` stays optional so
unsaved edits can be run, falling back to stored content, and the server validates
`workflowId` against `socket.data.workspace`.

Save uses standard HTTP optimistic concurrency: `If-Match: W/"<version>"` in,
`ETag: W/"<n+1>"` out, `409 { code:'version_conflict', currentVersion }` on mismatch,
`428` if the header is absent. The server-side primitive is the whole of AC-006b:

```ts
const { count } = await this.prisma.workflow.updateMany({
  where: { id, workspaceId, version: expected },
  data: { content, version: { increment: 1 }, name },
})
if (count === 0) throw new ConflictException(...)
```

`updateMany`, not `update` — `update` requires a unique `where` and throws `P2025` on a
compound condition.

> **The two design agents disagreed here.** The frontend agent argued for keeping save on
> the socket with `requestId` correlation, to reuse the one frontend mechanism that
> already works and is tested. I went with REST because conflict semantics are HTTP's
> native job, `count === 0` is an atomic primitive a mocked Prisma cannot fake,
> Socket.IO has no status codes (`graphOperationFailed` already exists as that
> workaround), and the frontend must build an HTTP client for workspaces/workflows/
> templates/workshops/admin regardless — so "no HTTP abstraction today" stops being true
> at Slice 6 either way. Reversible if you disagree; say so before Slice 2.

**Implemented in slice 4a.** `src/workflow/workflow-etag.ts` parses `If-Match` in all its
documented forms (`W/"5"`, `"5"`, bare `5`, comma lists, `*`).

### ADR-0003 — Immutable revisions, enforced by the database

- **`Template.currentRevision` is an integer, not an FK to the current revision row.** An
  FK creates a circular Template↔TemplateRevision dependency needing a nullable unique
  column and a two-statement transaction. The integer makes "create revision N+1"
  race-free with no `SELECT … FOR UPDATE`: `update({ data: { currentRevision: { increment: 1 } } })`
  compiles to atomic SQL, and `@@unique([templateId, revision])` becomes a belt-and-braces
  assertion rather than the concurrency mechanism.
- **The referenced-revision guard (FR-003b) lives at the DB.** `Workflow.sourceTemplateRevisionId`
  and `Workshop.templateRevisionId` both use `onDelete: Restrict`; Prisma surfaces `P2003`,
  which the service turns into `409 { code:'revision_referenced' }`. A service-only check
  is TOCTOU-racy. Keep it anyway, purely for the better message.
- **Template deletion is soft (`deletedAt`).** FR-003c needs revisions resolvable after
  deletion, and `Restrict` makes a hard delete impossible once any revision exists.

**Implemented in slice 5.** One extra rule emerged while building it: revision lookup by
id (`TemplateService.getRevision`) applies **no visibility filter at all** — not
`published`, not `deletedAt`. That is what keeps unpublish and soft-delete from breaking
workflows already bound to a revision (AC-014a, AC-017).

### ADR-0004 — Three SQL migrations, content backfill inside Nest, archive rather than drop

1. `add_workspace_model` — DDL only. Touches nothing existing, so it is independently
   safe to deploy; running old code is unaffected.
2. `backfill_workflows_from_graphs` — `INSERT … SELECT` into one legacy workspace with
   **`tokenHash` NULL**, so nobody can ever authenticate into it; it is reachable only
   through the facilitator admin API.
3. `retire_legacy_tables` — `ALTER TABLE "Graph" RENAME TO "LegacyGraph"` and
   `DROP TABLE "Settings"` (provably dead: `grep -rn "prisma.settings" src` is empty).
   **Rename, don't drop.** The "no dual-run shim" decision is about the API surface, not
   the archive table; the rows cost nothing and are the only rollback if the backfill is
   wrong on real data. Declare `model LegacyGraph` so drift detection stays clean; drop in
   wave 3. Leave `LtiPlatform` / `LtiClientRegistration` alone — dead today, but
   `packages/lti` is the intended 1.3 path.

**Legacy slugs are `legacy-<id>`, not slugified paths.** Deriving a slug from
`/ws/editor/{activity}/1/1` in SQL needs `regexp_replace`, and the transform is not
injective — `a/b` and `a-b` collide, and a collision fails the whole migration on a
production deploy. The readable value goes in `name` (the raw path), the exact original in
`legacyPath`.

**Content transform lives in `src/`, not `scripts/`** — because of the Dockerfile finding
above, a backfill an operator must remember to run is a backfill that will not run.
`src/migration/content-migration.service.ts` runs `OnApplicationBootstrap`, batches
`findMany({ where: { contentSchema: { lt: 2 } }, take: 200 })`, and is idempotent by
construction: once stamped, the `WHERE` excludes the row forever. Kill-switch
`CONTENT_MIGRATION_ENABLED=false`.

**The transform operates on raw JSON, never through `LGraph`.** `configure()` + `serialize()`
requires every node type to be registered, silently drops unregistered ones, and normalizes
structure — a round-trip is a lossy rewrite of production content.

Migrations 1 and 2 shipped in slice 2. Migration 3 is slice 8.

### ADR-0005 — Composite provider+model reference, additive

New `ModelRef = { providerKey: string; modelId: string }` in `packages/lib`. The
`models/llm` node gains `model_ref: ModelRef | null` and `needs_model_selection: boolean`.

**Do not remove `properties.model`, `available_models` or `available_model_sources` in
wave 1.** `LLMNode.onConfigure` (`LLMNode.ts:513-535`) reads `available_models` to populate
the editor's combo widget; stripping it empties the dropdown. Wave 2 replaces that read
with a `GET /api/models` fetch and can then drop the keys — and dropping a key nobody reads
needs no migration. "No second content migration" is satisfied by *adding* now.

**The resolution ladder matters more than it looks.**
`src/graph/graph-migration.test/legacy_graph.json` — real production-shaped content already
in the repo — contains one `models/llm` node with `"model": ""` and **no
`available_model_sources` key at all**. A literal FR-012 reading ("if more than one
provider exposes the id, don't guess") would mark every migrated node as requiring
selection, rendering every migrated workflow non-executable. So:

```
model empty/absent                    → model_ref = null,  needs_selection = false
available_model_sources[model] set    → model_ref = { providerKey: 'openai'|'local', modelId }
exactly one enabled provider          → model_ref = { providerKey: <that one>, modelId }
zero or ≥2 candidates                 → model_ref = null,  needs_selection = true
```

The third rule is not guessing — FR-012 forbids guessing only when *more than one*
provider exposes the id. Today's deployments have only the local worker configured, so
this keeps every migrated workflow runnable. Confirmed as open question #6.

### ADR-0006 — Integration tests against real Postgres, on the debug stack's port

Every backend spec today replaces `PrismaService` with hand-rolled `jest.fn()`s. That
cannot test a single one of this wave's acceptance criteria, because every one is a
*database* behaviour:

| AC | Must prove | Mockable? |
|---|---|---|
| AC-001 | `@@unique([workspaceId, slug])` permits the same slug in two workspaces | No |
| AC-006b | `updateMany({ where: { version } })` returns `count: 0` | No |
| FR-003b | `onDelete: Restrict` raises `P2003` | No |
| AC-005 | migration 2's SQL actually ran | No |
| FR-003 | `{ increment: 1 }` is atomic under concurrency | No |

A second Jest project targets `TEST_DATABASE_URL`, defaulting to the Postgres
`docker-compose.debug.yml` already publishes on **15432**. `TRUNCATE … RESTART IDENTITY
CASCADE` between tests. `test:int` **skips with a clear message** rather than failing when
the DB is unreachable, so a contributor without Docker sees no change. Not testcontainers:
it pulls images at test time and duplicates infrastructure this repo already has and
already debugs through. Repurpose the dead `test/jest-e2e.json` rather than adding a third
config.

**Not built yet.** Slices 4a and 5 were instead verified by scripted live runs against a
real server and a throwaway Postgres container (41 and 50 assertions respectively). That
found one real bug that unit tests could not — see below — but it is a scratch-file
technique, not a committed suite. `test:int` remains a slice 9 deliverable.

> **The bug live verification caught (slice 4a):** the `409` body was missing
> `currentVersion`. `HttpExceptionFilter.toBody()` rebuilt the response from `code` and
> `message` only, silently dropping every other key the thrower attached. Every unit test
> passed, because the service threw correctly. Fixed by preserving non-reserved keys;
> `http-exception.filter.spec.ts` now guards it.

### ADR-0007 — The editor/student split becomes a published projection

**This is the one finding that changes the schema and has no spec coverage.**

Today content identity is `(userType, activityName)`: `/ws/editor/…` and `/ws/student/…`
are two rows, and `publishGraph` (`useSocket.ts:122`) copies editor→student by string
replace. That is a **draft/publish gate** — an instructor's in-progress edits are not
visible to students until they publish.

Under SPEC-0004 the LTI workspace is keyed by resource link, not by role, so instructor and
student launches land in the *same* workspace and live edits become instantly visible to
students mid-course. No spec mentions this. My earlier draft removed `publishGraph` on the
grounds its semantics were undefined; that was wrong — the semantics are undefined in the
*new* domain, but the behaviour is load-bearing in the old one.

**Resolution:** add `publishedContent` / `publishedVersion` / `publishedAt` to
`Workflow`. Student launches read the published projection; instructor launches read
`content`. Two nullable columns and one boolean on the read path.

Columns shipped in slice 2; `WorkflowService.publish()` shipped in slice 4a, and it
deliberately **does not touch `version`** — publishing is not an edit, so it must not
invalidate another tab's `If-Match`. The read-path split lands with slice 4b.

---

## Schema

`content` is **`String`, not `Json`**: the existing `Graph.graph` is TEXT holding
`JSON.stringify(...)`, the socket payload is a string, and `configure()` takes a parsed
object — so the migration is a literal column copy with zero parse risk and zero
normalization (jsonb reorders and dedups keys, harmless but unverifiable at migration
time). Cost: no SQL queries *into* content. Not needed in wave 1, and the `contentSchema`
stamp gives a scripted path later.

IDs are `cuid(2)` uniformly — workflow and workspace ids appear in URLs, and sequential
ints leak volume and make cross-environment copy-paste dangerous.

```prisma
enum WorkspaceType   { BROWSER WORKSHOP LTI }
enum TemplateKind    { WORKFLOW BLOCK }
enum RevisionOrigin  { BUNDLED FACILITATOR }
enum WorkshopStatus  { DRAFT PUBLISHED CLOSED }
enum ProviderType    { MODEL_WORKER OPENAI OPENROUTER OPENAI_COMPATIBLE }
enum ModelPolicyMode { DENY_ALL ALLOWLIST ALLOW_ALL }

model Workspace {
  id           String        @id @default(cuid(2))
  type         WorkspaceType
  label        String?
  tokenHash    String?       @unique   // sha256 hex; NULL = unreachable by token
  ltiKey       String?       @unique   // "<issuer>|<context_id>|<resource_link_id>"
  workshopId   String?
  workshop     Workshop?     @relation(fields: [workshopId], references: [id], onDelete: Cascade)
  createdAt    DateTime      @default(now())
  lastActiveAt DateTime      @default(now())
  workflows    Workflow[]
  @@index([type, lastActiveAt])
}

model Workflow {
  id                       String            @id @default(cuid(2))
  workspaceId              String
  workspace                Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  slug                     String
  name                     String
  content                  String
  version                  Int               @default(1)
  contentSchema            Int               @default(2)
  publishedContent         String?           // ADR-0007
  publishedVersion         Int?
  publishedAt              DateTime?
  sourceTemplateId         String?
  sourceTemplateRevisionId String?
  sourceTemplateRevision   TemplateRevision? @relation(fields: [sourceTemplateRevisionId], references: [id], onDelete: Restrict)
  legacyPath               String?           @unique
  createdAt                DateTime          @default(now())
  updatedAt                DateTime          @updatedAt
  @@unique([workspaceId, slug])
  @@index([workspaceId, updatedAt(sort: Desc)])
  @@index([contentSchema])
}

model Template {
  id              String   @id @default(cuid(2))
  slug            String   @unique
  kind            TemplateKind
  name            String
  description     String?
  category        String?
  tags            String[] @default([])
  published       Boolean  @default(false)
  currentRevision Int      @default(0)   // revision NUMBER, not an FK — ADR-0003
  deletedAt       DateTime?
  revisions       TemplateRevision[]
  @@index([kind, published, deletedAt])
}

model TemplateRevision {
  id            String         @id @default(cuid(2))
  templateId    String
  template      Template       @relation(fields: [templateId], references: [id], onDelete: Restrict)
  revision      Int
  origin        RevisionOrigin @default(FACILITATOR)
  name          String
  description   String?
  category      String?
  tags          String[]       @default([])
  content       String
  contentHash   String         // makes bundled re-seed idempotent
  contentSchema Int            @default(2)
  interfaces    Json?          // block external ports, SPEC-0003/FR-019
  createdAt     DateTime       @default(now())
  @@unique([templateId, revision])
}

model Workshop {
  id                 String           @id @default(cuid(2))
  code               String           @unique   // stored normalized
  title              String
  status             WorkshopStatus   @default(DRAFT)
  templateId         String
  templateRevisionId String
  templateRevision   TemplateRevision @relation(fields: [templateRevisionId], references: [id], onDelete: Restrict)
  expiresAt          DateTime?
  publishedAt        DateTime?
  closedAt           DateTime?
  workspaces         Workspace[]
  @@index([status, expiresAt])
}

model AdminSession {
  id         String   @id @default(cuid(2))
  tokenHash  String   @unique
  csrfHash   String              // session-bound CSRF, ADR-0001 note below
  createdAt  DateTime @default(now())
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  @@index([expiresAt])
}

model Provider {
  id          String       @id @default(cuid(2))
  key         String       @unique   // stable ref serialized into content
  type        ProviderType
  displayName String
  baseUrl     String?
  apiKeyEnc   String?      // "v1.<b64 iv>.<b64 tag>.<b64 ciphertext>", AES-256-GCM
  apiKeyHint  String?      // "sk-…4f2a" — proves a key is set without revealing it
  enabled     Boolean      @default(false)
  modelPolicy ModelPolicy?
}

model ModelPolicy {
  id            String          @id @default(cuid(2))
  providerId    String          @unique
  provider      Provider        @relation(fields: [providerId], references: [id], onDelete: Cascade)
  mode          ModelPolicyMode @default(DENY_ALL)
  allowedModels String[]        @default([])
}
```

**`lastActiveAt` writes are throttled, not per-request** — a write on every autosave
creates lock contention on a hot row:

```ts
await this.prisma.workspace.updateMany({
  where: { id, lastActiveAt: { lt: new Date(Date.now() - 5 * 60_000) } },
  data: { lastActiveAt: new Date() },
})
```

Race-free, zero reads, ≤1 write per workspace per 5 minutes. Same pattern for
`AdminSession.lastSeenAt`.

**Workshop codes:** Crockford base32 minus `I L O U` (kills O/0 and I/1 confusion when read
off a slide), 8 chars, displayed `XXXX-XXXX`, stored `XXXXXXXX`. `normalizeCode()` is a
pure function in `src/workshop/workshop-code.ts` with unit tests — it is the single point
where a write/read normalization mismatch becomes "my code doesn't work" in front of 50
people.

---

## Slices

Each is a worktree at `../NodeGrade-<task>` on `agent/<task>` off `dev`, merged to
`dev`, worktree and branch deleted after — per `AGENTS.md`.

| # | Branch | Contents | Independent? |
|---|---|---|---|
| ✅ 1 | `agent/backend-foundations` | `@nestjs/config`, `cookie-parser` wired, `trust proxy`, global `ValidationPipe`, global `HttpExceptionFilter`, one `resolveCorsOrigins()` replacing 3 duplicates, LTI log redaction, gateable lint, CI PR gate, root `yarn test`, the two frontend config bugs | **Merged** `d993aab` |
| ✅ 2 | `agent/workspace-schema` | Schema above, migrations 1+2 (not 3), `src/migration/*` + fixture tests | **Merged** `2198e87` |
| ✅ – | `agent/debug-generated-perms` | Debug stack no longer writes a root-owned `src/generated` onto the host | **Merged** `d3aad74` |
| ✅ 3 | `agent/admin-auth` | SPEC-0013 in full, hand-rolled login throttle | **Merged** `bea339a` |
| ✅ 4a | `agent/workspace-core` | `src/workspace/*`, `src/workflow/*` with `If-Match`, retention sweep, publish projection, E3 caps | **Merged** `38b71df` |
| 4b | `agent/workspace-cutover` | `websocket-auth.adapter.ts`, `parseLtiCookie`, LTI key + first-launch seeding, `GraphHandlerService` rewrite, delete `GraphController`, `ServerEvents.ts`, `/api` prefix — **plus its frontend counterpart** | **No — atomic merge train** |
| ✅ 5 | `agent/template-subsystem` | `src/template/*`, revision transaction, bundled seeder, `/from-template`, `/reset` | **Merged** `e5f208b` |
| 6 | `agent/workshop-entity` | `src/workshop/*`, code gen/normalization, `by-code`, transactional `join`, **debug seed** | **Next** — 5 is merged |
| F1 | `agent/fe-foundations` | Route extraction to `routes.tsx`, `NotFoundPage`, config-error screen replacing `alert()`, `useEditorUI` container sizing, delete `LogRouteAccess` and the `/editor/` reconnect redirect | **Yes** — runs against the old backend |
| F2 | `agent/fe-session` | `src/api/http.ts` + typed wrappers, `workspaceStore`, `useWorkspaceSession` | Needs 4a |
| F3 | `agent/fe-entry` | StartPage, WorkshopCodeEntry, WorkshopJoin, WorkflowListPage, templates stub, workshop indicator | Needs 6, F2 |
| F4 | `agent/fe-autosave` | `useAutosave`, `SaveStatus.tsx`, `beforeunload` + `useBlocker`, debug bridge v2 | Needs 4a, F2 |
| F5 | `agent/fe-facilitator` | Login, `RequireFacilitator`, minimal workshop admin | Needs 3, 6 |
| 7 | `agent/provider-model` | Provider seeder, `GET /api/admin/providers`, `ProviderKey` constants in lib | Needs 2, 3 |
| 8 | `agent/retire-legacy-graph` | Migration 3, delete `GraphService`, benchmark → `workflowId` + `@Facilitator()` (E2) | Last |
| 9 | `agent/wave1-docs` | Smoke tests, ADRs, README, `test:int` | Parallel |

**4b is the one place "independently mergeable" genuinely cannot hold.** Deleting
`GraphSchema` breaks `AppBar.tsx:1` and `graph.controller.ts` simultaneously; renaming
events breaks both `EventHandlerMap` consumers. Author the shared-contract change first as
a branch the backend and frontend branches both fork from, and merge all three together.

### Notes that would otherwise be lost

**Auth (Slice 3).** Sessions live in the DB, not memory — dev runs `nest start --watch`, so
in-memory means the facilitator is logged out on **every file save** while building
workshop content. That is a once-a-minute event, not a theoretical restart edge case.
Credential compare hashes both sides first so `timingSafeEqual` gets equal-length buffers,
and compares username and password **without short-circuiting**. CSRF is *session-bound*
double-submit — store `sha256(csrfToken)` on `AdminSession` and require `X-CSRF-Token` to
hash-match — which is strictly stronger than cookie-vs-header equality and costs one
column. Not `csurf`; it is deprecated. **Throttling is hand-rolled, not `@nestjs/throttler`** —
reversed during Slice 1: the current release (6.5.0) peer-depends on `@nestjs/common`
≤ 11 while this repo is on Nest 12, with non-overlapping ranges. A sliding window over an
in-memory Map, scoped to the login route, is ~30 lines and carries no compatibility risk.
Scope it to the login controller, never globally — a global throttle would hit the
debounced autosave of 50 participants at login-tier limits. When credentials are absent,
guards throw **503 `admin_disabled`, not 401**, so the frontend renders "administration is
disabled" instead of an unusable form; `GET /api/admin/auth/session` is unauthenticated
and returns `{ enabled: false }` so the admin surface can be hidden without probing a
protected route.

The sliding window was generalised in slice 4a into `src/common/sliding-window.ts` and is
now shared by login and workspace creation. It is deliberately **not** `@Injectable` — its
constructor takes primitives, which Nest cannot resolve.

**The `secure: true` trap.** It is unconditional in `lti.controller.ts` today, which means
the LTI cookie is silently never set in the plain-HTTP debug stack. Replicating that for
the admin cookie makes local login impossible. Add `COOKIE_INSECURE`, default false, set in
`docker-compose.debug.yml`, one `WARN` at bootstrap. `SameSite=Lax` is correct —
`localhost:5173 → localhost:5000` is same-site, since site is scheme + registrable domain
and port is irrelevant.

**LTI (Slice 4b).** `oauth_consumer_key` is LTI 1.1's only true issuer analogue and is
already in the POST body but is typed nowhere (`toolRegistration.ts:69`) and validated
nowhere (`lti-validation.pipe.ts:64` requires only `oauth_callback`). Add it, fall back to
`tool_consumer_instance_guid`. Key is
`[issuer, context_id, resource_link_id].join('|')` — resource-link granularity, matching
what `custom_activityname` effectively identifies today. Extending the cookie **invalidates
every already-issued LTI cookie** on deploy; that is acceptable (relaunch reissues) but
must degrade gracefully — `parseLtiCookie` returns legacy cookies without the new fields as
*legacy*, logged `WARN` not `ERROR`, never throwing. Precedence is strict and never merges:
valid token → LTI cookie → none. The frontend's obligation: **in LTI mode, do not attach a
browser workspace token.**

**Body size (slice 4a finding).** Express defaults to a 100 KB JSON limit and
`legacy_graph.json` — real production-shaped content — is already 33 KB. `main.ts` now sets
`app.useBodyParser('json', { limit: '8mb' })`. A workshop participant hitting the default
limit mid-edit would look exactly like data loss.

**Retention (Slice 4a).** FR-009a and AC-006a disagree on the workshop clock. Use
`max(lastActiveAt, closedAt ?? expiresAt) + 60d`, which satisfies both readings. Plain
`setInterval` gated on `RETENTION_ENABLED`, **not `@nestjs/schedule`** — the sweep is two
`deleteMany` calls, and a public `async sweep(now: Date)` is directly unit-testable where a
`@Cron`-decorated method is not. Folds in expired `AdminSession` cleanup. LTI workspaces are
never swept (FR-009b).

**Template seeding (Slice 5).** The seeder creates a revision only when the bundled content
hash differs from the last revision **it itself created** (`origin: BUNDLED` +
`contentHash`). It never overwrites a `FACILITATOR` revision and never touches `published`
or `deletedAt`. If any facilitator revision exists it skips the template entirely —
appending would not destroy their work, but it would move `currentRevision` off it, so the
next "use template" would hand out the shipped version instead of theirs.

**Bundled templates are TypeScript modules, not JSON assets** (`src/template/bundled/*.ts`)
— the production image copies only `dist`, `prisma/` and `prisma.config.ts`, so JSON under
`src/` would need `nest-cli.json` asset config and would silently not be there if that
config ever drifted. Same trap as the `scripts/` finding.

**Every bundled template is loaded through a real `LGraph` in its spec.** `configure()`
silently drops nodes it cannot construct, so a template referencing an unregistered type
compiles fine and then opens as a broken canvas in front of a room. Comparing node counts
before and after is the only thing that catches it.

**FR-021's block library is deliberately partial.** Slice 5 shipped the mechanism, the
interface declaration format (`BlockInterfaces` in `packages/lib`) and the feedback
generator. The rubric scorer, answer classifier, validation/review and consistency check
are assessment *design* — real prompts, real scoring logic — and belong with the WAIE
content in SPEC-0007. Adding one is now: drop a file in `src/template/bundled/`, list it in
`BUNDLED_TEMPLATES`; the integrity spec picks it up automatically.

**Autosave (F4).** Dirty detection is **poll-diff at 1 Hz** — `JSON.stringify(lgraph.serialize())`
against the last-saved string — not LiteGraph change callbacks. Hooking
`onNodeAdded`/`onConnectionChange`/widget callbacks looks cleaner and is a trap: LiteGraph's
graph-level coverage is incomplete, widget edits and drags do not reliably surface, and a
missed dirty signal is silently lost participant work — exactly what AC-009 exists to
prevent. Intercepting `setDirtyCanvas` is worse; it fires on pan and zoom. Debounce 1.5 s,
hard ceiling 10 s.

**The `configure()` trap.** `useServerEvents.ts:116` (`graphFinished`) and `:165`
(`graphLoaded`) both call `lgraph.configure(JSON.parse(payload))`. Under poll-diff every run
marks the workflow dirty → pointless save → with two tabs, a conflict storm. Route both
through `applyServerGraph(lgraph, json)` which resets the baseline.

**Conflict UX.** `409` halts autosave — do not keep hammering — and offers "Reload newer
version" and "Save a copy". The latter is the one that matters in a room, where two tabs is
an accident and losing a participant's edits on stage is unacceptable. Never silently
overwrite; no force-save in wave 1.

**Workshop indicator (F3).** Joining creates a *second* workspace, so a returning user owns
two and "My workflows" shows one. AC-004 deliberately requires the pre-existing ones not be
listed — without a visible "you are in workshop X" indicator that reads to the user as data
loss. ~20 lines.

**Debug seed is a hard blocker (Slice 6).** `scripts/seed-debug.ts` upserts two `Graph` rows
by path. It must become: a BROWSER workspace with a **fixed** token, a Template + revision
from `tools/debug/demo-graph.json`, a **PUBLISHED workshop with a fixed code**, and an LTI
workspace + workflow for `debug/demo/1`. The fixed token and code are what keep
`e2e/debug-stack.spec.ts` and `tools/debug/stack.mjs`'s printed URLs deterministic.
**Without a seeded published code there is no wave-1 smoke test at all.**

**E2E (Slice 9).** `debugBridge.ts` emits raw `runGraph`/`saveGraph` with old payloads, so it
breaks the instant the protocol changes, taking `e2e/debug-stack.spec.ts` with it. Bump to
`version: 2` with `workspaceState()`, `saveStatus()` and `saveNow(): Promise<SaveStatus>`
(flushes the debounce — that is what makes AC-009 testable without `waitForTimeout`).
Repoint the existing spec to `e2e/lti-compat.spec.ts`; it already navigates
`/ws/editor/debug/demo/1`, so it becomes the LTI regression guard. Add
`workspace-isolation.spec.ts` driving **two browser contexts** through one code. The bridge
is installed from `Canvas.tsx` so it only exists in the editor — drive the pre-editor flow
through the real DOM with `data-testid`s rather than splitting the bridge.

---

## Resolutions

All nine resolved; no open questions remain.

| # | Question | Resolution |
|---|---|---|
| 1 | Student/instructor projection | **Implement ADR-0007.** `publishedContent`/`publishedVersion`/`publishedAt` on `Workflow`; student launches read the projection, instructor launches read `content`. Two nullable columns against a silent regression that would surface to students mid-course. |
| 2 | OAuth 1.0a verification | **Implement — but gated on `LTI_CONSUMER_SECRET` being set.** Unset ⇒ verification skipped with a bootstrap `WARN`. Verification that hard-fails on deploy would take a working LMS integration down with it; opt-in per deployment gets the protection without that risk. |
| 3 | Save transport | **REST with `If-Match`/`ETag`.** The frontend builds an HTTP client for workspaces/workflows/templates/workshops/admin regardless, so the "no HTTP abstraction" argument expires at F2. |
| 4 | Bundled re-seed | **Seeder never overwrites a `FACILITATOR` revision** and never touches `published`. It appends a `BUNDLED` revision only when the bundled hash differs from the last `BUNDLED` revision it created. |
| 5 | `content` column type | **`String`.** Literal column copy in the migration, zero parse risk, no jsonb key reordering. `contentSchema` gives a scripted path if SQL-queryable content is ever needed. |
| 6 | Legacy model resolution | **Use the ladder in ADR-0005.** FR-012 forbids guessing only when *more than one* provider exposes the id; with exactly one enabled provider there is one possible answer. The strict reading bricks every migrated workflow. |
| 7 | `/api` prefix vs LMS URL | **Exclude `health` and `lti/basiclogin` from the prefix**, so the LMS-registered `POST /lti/basiclogin` is byte-identical. Removes the risk rather than mitigating it — no verification needed. |
| 8 | Slug vs name | **Auto-generated slug** derived from `name`, unique per workspace with `-2`/`-3` dedupe, never shown in the UI. `name` is user-editable. `workflowId` on the wire. |
| 9 | Admin surface depth | **Thinnest.** Login, create/publish/close workshop. Template authoring is wave 2; wave-1 templates arrive via seed only. |
| — | Retention sweep trigger | Plain `setInterval` gated on `RETENTION_ENABLED`, not `@nestjs/schedule` — a public `sweep(now)` is unit-testable where a `@Cron` method is not. |
| — | Workshop retention clock | `max(lastActiveAt, closedAt ?? expiresAt) + 60d`, satisfying both FR-009a and AC-006a. |

---

## Environment variables introduced

| Variable | Default | Slice | Purpose |
|---|---|---|---|
| `COOKIE_INSECURE` | `false` | 3 | Allow non-`secure` cookies on the plain-HTTP debug stack |
| `RETENTION_ENABLED` | `true` | 4a | Kill switch for the retention sweep |
| `WORKSPACE_MAX_WORKFLOWS` | `50` | 4a | E3 cap; LTI workspaces exempt |
| `WORKSPACE_CREATE_MAX` | `30` | 4a | E3 per-IP workspace creation cap |
| `WORKSPACE_CREATE_WINDOW_MS` | `3600000` | 4a | Window for the above |
| `TEMPLATE_SEED_ENABLED` | `true` | 5 | Kill switch for the bundled template seeder |
| `CONTENT_MIGRATION_ENABLED` | `true` | 2 | Kill switch for the boot-time content backfill |
| `LTI_CONSUMER_KEY` / `LTI_CONSUMER_SECRET` | unset | 4b | OAuth 1.0a verification; unset ⇒ skipped with a `WARN` |

---

## Verification

```bash
yarn install
yarn workspace backend exec tsc --noEmit    # baseline: clean
yarn test                                   # backend + frontend
yarn workspace backend run lint:check       # non-mutating, gates PRs
yarn test:int                               # not built yet — slice 9
yarn debug:up && yarn test:e2e              # Playwright on the Docker debug stack
```

Manual conference rehearsal (`yarn debug:serve`, frontend on 15173):

1. Log in at `/admin`; create a workshop bound to the seeded template revision; publish;
   note the code.
2. Clean browser profile → `/workshop/<code>`. A workflow opens and
   `__NODEGRADE_DEBUG__.workspaceState()` shows a WORKSHOP workspace distinct from the
   browser one.
3. Edit a node property, wait for `Saved`, reload — the edit persists.
4. Second profile, same code: two distinct workflows, neither profile sees the other's.
5. Same workflow in two tabs; save in one then the other — the second shows a conflict and
   does not clobber (AC-006b, AC-012).
6. Close the workshop; a fresh join shows "workshop unavailable" while an already-joined
   participant keeps working.
7. LTI regression: basic launch lands in a workflow; a second launch from the same context
   reuses the same workspace; a student launch sees the *published* projection, not the
   instructor's live edits (ADR-0007).
