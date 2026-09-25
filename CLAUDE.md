# CLAUDE.md

## Project

NodeGrade automates short-answer grading with node graphs. Facilitators sign in at
`/admin`, compose a workshop from one or more workflow templates (each pinned to a
revision or following the newest one), and hand out an eight-character code. The code is
the only way in for participants — there are no anonymous workspaces outside a workshop
(LTI launches aside). Each participant browser gets an isolated workshop workspace, starts
the workshop's templates into its own workflow copies from the workshop overview, edits
them in a LiteGraph editor, and runs them against LLM and NLP providers.

Yarn 4 workspaces monorepo, TypeScript throughout: NestJS 12 + Prisma 7 + PostgreSQL
backend, React 19 + Vite 8 + MUI 7 + litegraph.js PWA frontend, a shared graph/event
library, an LTI 1.3 library, and a Python Flask sentence-embedding worker.

## Architecture

```text
Backend (NestJS, ESM)          packages/backend/src/        entry: src/main.ts, src/app/app.module.ts
Frontend (React + Vite PWA)    packages/frontend/src/       entry: src/main.tsx, src/routes.tsx
Shared graph library           packages/lib/src/            @haski/ta-lib (nodes, events, model types)
LTI 1.3 library                packages/lti/                @haski/lti
Embedding/similarity worker    models/                      Flask + sentence-transformers
Database schema + migrations   packages/backend/prisma/
Specifications                 specs/SPEC-00xx-*/spec.md
Architecture decisions         docs/adr/
Debug stack (Docker Compose)   tools/debug/, docker-compose.debug.yml
Real stack (Docker Compose)    tools/stack.mjs, docker-compose.yml
Production stack (Portainer)   docker-compose.prod.yml, stack.env.example, .github/workflows/deploy.yml
Browser e2e                    e2e/
```

Deeper maps: `docs/architecture.md` (how it fits together), `docs/module-map.md` (where
things live).

## Where to start

```text
UI page, route, editor panel      → packages/frontend/src/pages/, src/components/editor/
Frontend server calls             → packages/frontend/src/api/http.ts
Participant session / tokens      → packages/frontend/src/store/workspaceStore.ts
Workshop join and overview (UI)   → packages/frontend/src/pages/WorkshopJoin.tsx, src/components/TemplateCard.tsx
Graph node behaviour or new node  → packages/lib/src/nodes/ (+ NodeDefinitionRegistry.ts)
Embedding, similarity, entailment → models/model_worker.py, packages/lib/src/nodes/utils/
Socket event contract             → packages/lib/src/events/ServerEvents.ts
Graph execution (server)          → packages/backend/src/graphgateway/, src/core/Graph.ts
Workflow persistence, ETags       → packages/backend/src/workflow/
Version history, restore          → packages/backend/src/workflow/workflow-history.service.ts
Workspace access, retention       → packages/backend/src/workspace/
Templates, bundled content        → packages/backend/src/template/
Workshops and join codes          → packages/backend/src/workshop/
Workshop participant API          → packages/backend/src/workshop/workshop-participant.service.ts
Workshop admin UI, entries editor → packages/frontend/src/pages/admin/WorkshopAdmin.tsx, src/pages/admin/adminApi.ts
Workshop preflight / readiness    → packages/backend/src/workshop/workshop-readiness.service.ts
Run records, submission history   → packages/backend/src/run/, packages/lib/src/nodes/ReviewFlagNode.ts
Result cards, output display types→ packages/lib/src/nodes/OutputNode.ts, src/nodes/utils/outputPresentation.ts, packages/frontend/src/components/ResultCard.tsx
Participant preview strings       → packages/frontend/src/i18n/preview.ts
Facilitator auth, CSRF, sessions  → packages/backend/src/auth/
Providers, models, credentials    → packages/backend/src/provider/
LTI launch and registration       → packages/backend/src/lti/, packages/lti/
Specification consistency rules   → tools/spec-lint/
Browser smoke test, CI gating     → e2e/, .github/workflows/pr.yml, .github/rulesets/
Deployment, images, Portainer     → docker-compose.prod.yml, .github/workflows/deploy.yml, README "Deploying with Portainer"
Schema change                     → packages/backend/prisma/schema.prisma + migrations/
Content schema backfill           → packages/backend/src/migration/
```

Specification status: `specs/index.md` holds the authoritative table — every wave is
implemented.
Wave-1 implementation notes and escalations live in `docs/wave-1-plan.md`.

## Commands

```bash
yarn install                       # install
yarn setup                         # prisma generate + migrate deploy (needs DATABASE_URL)
yarn dev                           # all workspaces in watch mode
yarn debug:up                      # deterministic full stack in Docker (ports 15xxx/18000); also debug:status|logs|down|reset
yarn dev:up                        # deployable stack with the real models (ports 8080/5000/8002/5432); also dev:serve|status|logs|down|reset
yarn build                         # topological build of all workspaces
yarn typecheck                     # backend tsc --noEmit + frontend tsc
yarn lint:check                    # eslint, zero warnings
yarn lint:specs                    # specs/ consistency linter; yarn test:specs covers it
yarn test                          # backend jest + frontend vitest
yarn workspace backend test --testPathPattern workflow-etag              # single backend suite
yarn workspace @haski/ta-frontend test:run src/pages/StartPage.test.tsx  # single frontend suite
yarn test:int                      # backend *.int-spec.ts against debug Postgres on 15432
yarn test:e2e                      # Playwright; boots the debug stack itself
```

The backend imports `@haski/ta-lib` from `packages/lib/dist`; the frontend maps it to
`../lib/src` through tsconfig paths. After editing `packages/lib`, run
`yarn workspace @haski/ta-lib build` before trusting any backend typecheck or jest result —
a stale `dist` produces failures that look like code bugs.

## Architectural invariants

- Workspace authorization comes from the bearer access token only. No handler may take a
  workspace id from a path, query or body; `WorkspaceGuard` resolves it and handlers read
  `@CurrentWorkspace()` (ADR-0001).
- Participant workspaces are created only by a workshop join
  (`POST /api/workshops/by-code/:code/join`) or an LTI launch. `BROWSER` workspace tokens
  are rejected (ADR-0010).
- Workflow templates reach participants only through their workshop's entries
  (`/api/workshops/current/**`). `/api/templates` is workspace-scoped and serves `BLOCK`
  templates only, for the editor palette (SPEC-0022).
- A CLOSED or expired workshop is read-only for its participants: `WorkspaceGuard` rejects
  every non-GET/HEAD request with `workshop_closed`, and `GraphHandlerService` re-checks the
  workshop on every run rather than at socket connect.
- REST persists workflows with `If-Match`/`ETag` optimistic versions; Socket.IO only runs
  graphs and streams trace events (ADR-0002).
- Template revisions are immutable. New content means a new revision, never an update
  (ADR-0003).
- Node model choices are provider-qualified `ModelRef` values, migrated in-process by
  `ContentMigrationService` and stamped with `contentSchema` (ADR-0005).
- Provider API keys live encrypted in `Provider.apiKeyEnc` and are never returned by an
  API. Nodes receive credentials only through the injected `ModelCompletionRuntime`.
- Which models a participant may pick and run is decided server-side by the provider's
  `ModelPolicy`, enforced in `ProviderRuntimeService` on both the catalog and execution.
  Filtering in the editor is presentation, never enforcement (ADR-0008).
- Embedding similarity is evidence, never a verdict. A pass/fail decision uses
  `text/semantic-equivalence` (rules, then a cosine floor, then entailment); a threshold
  on `models/cosine-similarity` marks the wrong learner correct, because "Yes" and "No"
  score 0.89 against each other (`docs/semantic-equivalence-calibration.md`).
- Node types exist once, in `packages/lib`. Frontend and backend both import them from
  `@haski/ta-lib`; neither defines its own.
- Backend is ESM: relative imports carry a `.js` extension even in TypeScript.
- Frontend talks to the server only through `src/api/http.ts` and `src/utils/socket.ts`.
- Generated, never edited by hand: `packages/backend/src/generated/prisma`,
  `packages/*/dist`.
- Branching rules in `AGENTS.md` are binding: work in a git worktree on an `agent/*`
  branch, never commit directly to `dev` or `main`.

## Development workflow

Before coding:

1. Route the task with *Where to start* above.
2. If still unclear, read `docs/module-map.md`.
3. Read the nearest analogous implementation and its `.spec.ts`/`.test.tsx` neighbour
   before inventing a pattern.

After coding:

1. Run the narrowest verification (single suite), then `yarn typecheck`.
2. Rebuild `@haski/ta-lib` first if you touched `packages/lib`.
3. Update the specification status and the navigation docs per the rules below.

## Repository navigation maintenance

When work finishes a specification, or changes what one requires, update both places that
record it: the `status` in `specs/SPEC-00xx-*/spec.md` frontmatter (lowercase `draft`,
`implemented`, `deferred`, plus a new `updated:` date) and the Status column in
`specs/index.md` (title case). The two must always agree, and requirement changes belong in
the spec file rather than only in code.

Update `docs/module-map.md` when a module is added, removed, renamed or moved, when its
primary responsibility or entry point changes, or when dependencies between major modules
change.

Update `docs/architecture.md` when architectural boundaries, runtime components,
dependency direction, communication mechanisms, data flows or persistence change.

Update `CLAUDE.md` when task routing, commands, an invariant, or a top-level directory's
purpose changes.

Update `.claude/rules/` when a subsystem gains or loses a persistent local convention.

`yarn lint:specs` checks that agreement mechanically, along with dependency, reference
and traceability consistency across `specs/`; run it after any change under `specs/`.

Do not touch these files for bug fixes, renames, internal refactors, or implementation
details. The test: would this change where a future agent looks, what it must understand
about a module, or which rule it must follow?
