# Module map

Where things live. For how the pieces fit together, read `docs/architecture.md`.

## Workspaces and participant sessions

Location: `packages/backend/src/workspace/`, `packages/frontend/src/store/`

Responsibilities:

- issue and resolve opaque workspace access tokens (only the SHA-256 hash is stored)
- scope every participant operation to one workspace
- `BROWSER`, `WORKSHOP` and `LTI` workspace kinds
- retention sweeps and last-active bookkeeping

Primary entry points:

- `workspace.service.ts`, `workspace-token.ts`
- `guards/workspace.guard.ts`, `decorators/current-workspace.decorator.ts`
- `retention.service.ts` (plain `setInterval`, public `sweep(now)`)
- frontend: `store/workspaceSession.ts` (memoized bootstrap), `store/workspaceStore.ts`
  (localStorage)

Used by: every participant-facing controller, the Socket.IO run handler, the editor UI.

Tests: `packages/backend/src/workspace/**/*.spec.ts`

## Workflow persistence

Location: `packages/backend/src/workflow/`

Responsibilities:

- workflow CRUD inside a workspace; identity is `(workspaceId, slug)`
- optimistic concurrency through `If-Match`/`ETag`
- draft `content` versus `publishedContent` projection (ADR-0007)
- creation and reset from a template revision

Primary entry points: `workflow.controller.ts`, `workflow.service.ts`, `workflow-etag.ts`,
`workflow-slug.ts`, `dto/workflow.dto.ts`

Depends on: Prisma, templates. Used by: editor UI, graph execution, benchmark.

Tests: `packages/backend/src/workflow/**/*.spec.ts`,
`packages/backend/test/wave1.int-spec.ts`

## Templates

Location: `packages/backend/src/template/`

Responsibilities:

- `WORKFLOW` and `BLOCK` templates with immutable revisions
- publish/unpublish and soft delete, gallery listing
- block interface declarations used for palette insertion
- seeding bundled templates on boot

Primary entry points: `template.service.ts`, `template.controller.ts`,
`admin-template.controller.ts`, `template-seed.service.ts`, `template-content.ts`,
`template.serializer.ts`, `bundled/index.ts`

Bundled graphs are TypeScript modules under `bundled/`. The three WAIE tutorial graphs
(`bundled/workshop-*.ts`, exported together as `WORKSHOP_TEMPLATES`) are declared through
`bundled/graph-builder.ts`, which owns slot wiring, link ids and `last_*_id` bookkeeping so a
template states only nodes and connections. Their subject matter is everyday science (day
and night, the water cycle, sharing a pizza) so participants evaluate the assessment
workflow rather than their own knowledge. Slugs are named after the assessment concept,
not the example, so an example can change without a new slug; slugs that did change are
listed in `RETIRED_TEMPLATE_SLUGS` and the seeder unpublishes them on boot.
`packages/backend/scripts/run-workshop-live.ts` (`yarn workspace backend workshop:live`)
runs those graphs headlessly against the real KATALYST deployment with the prepared test
answers — the facilitator's pre-workshop check.

Tests: `packages/backend/src/template/**/*.spec.ts`

## Workshops

Location: `packages/backend/src/workshop/`

Responsibilities: workshop lifecycle (`DRAFT`/`PUBLISHED`/`CLOSED`), join-code generation
and normalization, minting a workspace plus workflow copy on join, and the entry preflight
and facilitator readiness checks (backend, template, node types, provider/model health).

Primary entry points: `workshop.service.ts`, `workshop.controller.ts`, `workshop-code.ts`,
`workshop-readiness.service.ts`

Depends on: Prisma, templates, providers (model catalog for the readiness check).

Related UI: `packages/frontend/src/pages/WorkshopJoin.tsx`,
`packages/frontend/src/utils/workshopCode.ts`, the readiness panel in
`packages/frontend/src/pages/admin/AdminPage.tsx`

Tests: `packages/backend/src/workshop/**/*.spec.ts`

## Facilitator authentication

Location: `packages/backend/src/auth/`

Responsibilities: password login from configured credentials, database-backed sessions
(survive `nest start --watch` restarts), CSRF token bound to the session, login throttling.

Primary entry points: `admin-auth.service.ts`, `admin-auth.controller.ts`,
`guards/admin-session.guard.ts`, `admin-credentials.ts`, `login-throttle.ts`,
`decorators/facilitator.decorator.ts`

Transport: session cookie plus `X-CSRF-Token` header — distinct from the participant
bearer-token surface.

Tests: `packages/backend/src/auth/**/*.spec.ts`

## Providers and model runtime

Location: `packages/backend/src/provider/`

Responsibilities:

- provider records (`MODEL_WORKER`, `OPENAI`, `OPENROUTER`, `OPENAI_COMPATIBLE`)
- AES-256-GCM credential storage and masked hints
- model catalog probing with a short TTL, provider status codes
- `ModelCompletionRuntime` implementation handed to nodes at execution time
- per-provider model policy (DENY_ALL / ALLOWLIST / ALLOW_ALL), enforced on the model
  catalog and on execution
- deployment-global concurrency guards protecting a shared provider key

Primary entry points: `provider.service.ts`, `provider-runtime.service.ts`,
`provider.controller.ts`, `model.controller.ts`, `provider-credential-cipher.ts`,
`model-policy.ts`, `execution-limits.service.ts`, `execution-limits.controller.ts`

Related: shared types in `packages/lib/src/nodes/types/ModelRef.ts`; admin UI in
`packages/frontend/src/pages/admin/AdminPage.tsx`

Tests: `packages/backend/src/provider/**/*.spec.ts`

## Graph execution

Location: `packages/backend/src/graphgateway/`, `packages/backend/src/core/`

Responsibilities:

- Socket.IO `runGraph`/`cancelRun` handling, per-client run registry, cancellation
- topological LiteGraph execution with per-node lifecycle events
- trace output sanitizing and truncation
- xAPI statements for LTI launches

Primary entry points: `graph.gateway.ts`, `graph-handler.service.ts`, `core/Graph.ts`,
`core/trace-sanitizer.ts`, `config/node-env.ts`, `packages/backend/utils/socket-emitter.ts`

Depends on: workflow service, provider runtime, `@haski/ta-lib` nodes.

Tests: `packages/backend/src/graphgateway/**/*.spec.ts`, `src/core/*.spec.ts`

## Shared graph library (`@haski/ta-lib`)

Location: `packages/lib/src/`

Responsibilities:

- every LiteGraph node implementation (`nodes/*.ts`, ~28 types)
- node metadata used by palette and inspector (`nodes/NodeDefinition.ts`,
  `nodes/NodeDefinitionRegistry.ts`, `nodes/LGraphRegisterCustomNodes.ts`)
- client/server event contracts and trace payloads (`events/ServerEvents.ts`)
- model reference and runtime interfaces (`nodes/types/ModelRef.ts`)
- REST/WebSocket payload types (`web/`)

Resolution differs by consumer: the backend imports the built `packages/lib/dist`, the
frontend resolves `../lib/src` through tsconfig paths. Rebuild the library after edits or
backend results go stale.

Note: `packages/frontend/src/utils/registernodes.ts` is legacy and unreferenced;
registration happens in this package.

## Editor UI

Location: `packages/frontend/src/pages/Editor.tsx`, `packages/frontend/src/components/`

Responsibilities: LiteGraph canvas hosting, palette/inspector/toolbar rails, autosave and
version conflict handling, undo history, run controls, trace and task views.

Primary entry points: `components/Canvas.tsx`, `components/editor/EditorToolbar.tsx`,
`components/editor/NodePalette.tsx`, `components/editor/NodeInspector.tsx`,
`components/editor/EditorRail.tsx`, `components/TaskView.tsx`, `components/TraceView.tsx`,
`hooks/useAutosave.ts`, `hooks/useGraphHistory.ts`, `hooks/useGraphOperations.ts`,
`hooks/useSocket.ts`, `hooks/useServerEvents.ts`, `hooks/useWorkflowForm.ts`,
`i18n/preview.ts`, `utils/graphBlocks.ts`

The preview's question and answer-length bounds come from the open graph through
`hooks/useWorkflowForm.ts`; its participant-facing strings live in `i18n/preview.ts`.

Tests: `packages/frontend/src/**/*.test.tsx`, `packages/frontend/src/**/*.test.ts`

## Entry, gallery and admin UI

Location: `packages/frontend/src/pages/`, routes in `packages/frontend/src/routes.tsx`

Primary entry points: `StartPage.tsx` (`/`), `WorkshopJoin.tsx` (`/workshop/:code`),
`WorkflowListPage.tsx`, `TemplatesPage.tsx`, `admin/AdminPage.tsx`
(`/admin/workshops`, `/admin/providers`, `/admin/templates`), `admin/TemplateAdmin.tsx`,
`lti/LtiRegister.tsx`, `NotFoundPage.tsx`

Server access: `api/http.ts` only. Runtime config: `utils/config.ts` +
`public/config/env.*.json`.

## LTI

Location: `packages/backend/src/lti/`, `packages/lti/`

Responsibilities: LTI 1.3 launch validation, platform registration, NRPS, JWT/JWKS
handling, launch cookie that carries `ltiKey` and editor/student role.

Primary entry points: `packages/backend/src/lti/lti.controller.ts`, `lti.service.ts`,
`lti-cookie.ts`, `lti-oauth.ts`, `pipes/lti-validation.pipe.ts`;
`packages/lti/src/lti/lti.ts`, `packages/lti/core/platform.ts`

Related: `packages/backend/src/utils/websocket-cookie.adapter.ts` forwards the launch
cookie onto the Socket.IO handshake.

## Content migration

Location: `packages/backend/src/migration/`

Responsibilities: in-process, idempotent backfill of stored workflow and template content
to the current `contentSchema` (currently provider-qualified model references). Runs on
`OnApplicationBootstrap`; disable with `CONTENT_MIGRATION_ENABLED=false`.

Primary entry points: `content-migration.service.ts`, `transform-llm-model-ref.ts`

## Benchmark and health

Location: `packages/backend/src/benchmark/`, `packages/backend/src/health/`

Benchmark runs a stored workflow over a dataset behind facilitator auth
(`POST /api/benchmark/run`); requires "Answer Input", "question" and "feedback output"
nodes. Health is unprefixed (`GET /health`) for container probes.

## Persistence

Location: `packages/backend/prisma/`

Schema `schema.prisma` (PostgreSQL); client generated into
`packages/backend/src/generated/prisma` by `yarn setup`. `LegacyGraph` is the pre-workspace
table kept for backfill. Migrations live in `prisma/migrations/`.

## Deterministic debug stack

Location: `tools/debug/`, `docker-compose.debug.yml`, `docs/debugging.md`

`stack.mjs` drives Compose (`up|serve|down|status|logs|reset`) on the 15xxx/18000 port
range with a fake model and embedding worker (`fake-model.mjs`), seeded demo graph
(`demo-graph.json`) and two published workshop codes: `WAVE-2026` on the demo graph and
`WAIE-2026` on the bundled WAIE template. `packages/backend/scripts/seed-debug.ts` writes
both before the server starts, using the bundled content byte for byte so the bootstrap
seeder recognises its own hash and appends no revision.

## Browser suite

Location: `e2e/`, `playwright.config.ts`

Playwright in Chromium and Firefox against the debug stack, which it boots via
`yarn debug:serve` or reuses if already running. `support/nodegrade.ts` holds the shared
workshop-entry helpers and the typed `window.__NODEGRADE_DEBUG__` bridge;
`conference-smoke.spec.ts` walks the conference happy path end to end,
`workspace-isolation.spec.ts` proves two sessions under one workshop code stay separate,
and `debug-stack.spec.ts` covers the deterministic model contract and autosave. No test
may reach a cloud provider: the stack ships no provider credential, and the suite asserts
the catalog offers only the local worker.

## Pull-request gate

Location: `.github/workflows/pr.yml`, `.github/rulesets/`

Three parallel jobs, each budgeted at 15 minutes: `verify` (build, typecheck, lint, unit
tests), `e2e` (browsers, debug stack, `yarn test:e2e`) and `specs` (specification linter).
`.github/rulesets/integration-branches-require-ci.json` is the ruleset that makes all
three required on `dev` and `main`; a repository administrator applies it with `gh api`,
since GitHub cannot read a ruleset from the tree.

## Specification linter

Location: `tools/spec-lint/`

`cli.mjs` runs `lint.mjs` over `specs/` (`yarn lint:specs`) and exits non-zero on any
inconsistency: frontmatter versus `specs/index.md`, `depends_on` versus the
`## Dependencies` prose, dangling SPEC/FR/AC references, dependency cycles, duplicate
local IDs, and requirements with neither a tracing acceptance criterion nor a
`Verification:` note. `parse.mjs` is the markdown/frontmatter reader; `lint.test.mjs`
(`yarn test:specs`) covers it with node:test and is gated by the `specs` job in
`.github/workflows/pr.yml`.

## Embedding worker

Location: `models/`

Flask + sentence-transformers service backing `SentenceTransformer`, `CosineSimilarity`
and semantic `KeywordCheckNode`. Reached through `MODEL_WORKER_URL` /
`SIMILARITY_WORKER_URL` injected by `packages/backend/src/config/node-env.ts`.
