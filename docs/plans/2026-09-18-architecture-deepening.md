# Architecture deepening plan (2026-09-18)

> Source: architecture review of `origin/dev` at `e6aca95`
> (Merge branch `agent/node-style` into dev), explored 2026-09-18 with three
> parallel codebase walks (backend, frontend, shared lib).
> Visual report (not in repo): `/tmp/architecture-review-20260918-201431.html`.
> Status: **proposed, not started**. Pick candidates in grilling before designing
> interfaces.

## Glossary (use exactly)

- **Module** — anything with an interface and an implementation (function,
  class, package, slice).
- **Interface** — everything a caller must know to use the module: types,
  invariants, error modes, ordering, config. Not just the type signature.
- **Depth** — leverage at the interface: a lot of behaviour behind a small
  interface. **Deep** = high leverage. **Shallow** = interface nearly as complex
  as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without
  editing in place.
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge
  concentrated in one place.
- Deletion test: imagine deleting the module. If complexity vanishes, it was a
  pass-through. If complexity reappears across N callers, it was earning its keep.
- The interface is the test surface. One adapter = hypothetical seam. Two
  adapters = real seam.

## Candidate order

Recommended execution order: 1, then 2 in the same wave; 3 next; 4–5 after a
grill; 6 only when a second adapter earns the seam.

| # | Candidate | Strength | Dependency category |
|---|---|---|---|
| 1 | Collapse the graph run path | Strong | Ports & adapters |
| 2 | Unify workspace resolution | Strong | Local-substitutable |
| 3 | Deepen the provider runtime | Strong | Mock (true external) |
| 4 | Collapse the template-content kernel | Worth exploring | In-process |
| 5 | Deepen the editor run sync | Worth exploring | In-process |
| 6 | Retire the dead lib seam; widen node hydration | Speculative | In-process |

---

## 1 · Collapse the graph run path (Strong, ports & adapters)

Files:

- `packages/backend/src/graphgateway/graph-handler.service.ts` (672; `handleRunGraph`
  lines 323+, `addOnNodeAdded`, `hydrateExistingNodes`, `isWorkspaceSaturated`,
  `sendImages`/`sendQuestion`, two ~70-line xAPI blocks; `(lgraph as any)._nodes`)
- `packages/backend/src/graphgateway/graph.gateway.ts` (82)
- `packages/backend/src/core/Graph.ts` (180; `executeLgraph`)
- `packages/backend/src/core/subgraph-compiler.ts` (469; `compileEditorGraphForExecution`)
- `packages/backend/src/core/trace-sanitizer.ts` (66; `sanitizeTraceOutputs`,
  `sanitizeExecutionError`; handler passes `[]` secrets)
- `packages/backend/src/config/node-env.ts` (21; `buildNodeExecutionEnv`)
- `packages/backend/src/template/template-content.ts` (418; `parseGraphContent`)
- `packages/backend/src/benchmark/benchmark.service.ts` (51; reaches into
  `workflow.content` directly, no compile/env/runtime/sanitize/limits, no DTO, zero specs)
- `packages/backend/src/xapi.service.ts` (46; module-global `getXapi()`)

Problem: the graph run module is shallow — one run bounces across 7 modules with
double parse/stringify (`JSON.stringify(parseGraphContent())` → `JSON.parse` into
`lgraph.configure`), an `any` cast into `_nodes`, `LLMNode.setRuntime` in two
places, and scoring/xAPI formatting duplicated in two blocks. The benchmark
module leaks across the seam: it bypasses `getExecutionContent`, the compiler,
env/runtime hydration, sanitizing, and limits.

Solution (plain English): deepen a single run module behind a run/cancel
interface; move compile, hydrate, sanitize, and xAPI behind its seam; keep the
gateway thin; route the benchmark module through the same interface instead of
`prisma.workflow.findUnique` + raw `LGraph.configure`.

Benefits:

- locality: run bugs (hydrate ordering, sanitize choice, xAPI shape) concentrate
  in one module.
- leverage: one interface, gateway + benchmark call sites.
- Tests hit one interface with an injected completion adapter instead of 7 mocks;
  delete old fragment specs once the interface tests exist.
- Benchmark divergence class of bug disappears.

Verification: backend run-path suites
(`graph-handler`, `Graph`, `subgraph-compiler`, `trace-sanitizer`,
`execution-signal`, `llmnode.openai`), then `yarn test:backend`; add a run-module
interface test with a mock `ModelCompletionRuntime` before deleting fragment tests.
Resolves the ADR-0002 seam violation (REST persists, socket executes) without
reopening the ADR.

---

## 2 · Unify workspace resolution (Strong, local-substitutable)

Files:

- `packages/backend/src/workspace/workspace.service.ts` (161; `resolveByToken`,
  `resolveByLtiKey`, `ResolvedWorkspace.publishedProjection?`)
- `packages/backend/src/workspace/workspace-token.ts` (51; `issueWorkspaceToken`,
  `hashWorkspaceToken`, `isWorkspaceTokenShape`, `parseBearerToken`)
- `packages/backend/src/workspace/guards/workspace.guard.ts` (64; sets
  `request.workspace` **with** `publishedProjection`)
- `packages/backend/src/workspace/decorators/current-workspace.decorator.ts` (33;
  `WorkspaceScoped` + `CurrentWorkspace`, no spec)
- `packages/backend/src/utils/websocket-cookie.adapter.ts` (74; sets
  `socket.data.workspace` **without** `publishedProjection`, no spec)
- `packages/backend/src/graphgateway/graph-handler.service.ts` (lines 330–359;
  ignores `workspace.publishedProjection`, recomputes
  `auth?.ltiCookie?.isEditor === false`)
- `packages/backend/src/workshop/workshop.service.ts` (lines 125–209; `join`
  reimplements lookup + creation; no spec)

Problem: workspace identity leaks across the seam. The HTTP guard, the socket
adapter, and the run handler each resolve differently; the optional
`publishedProjection?` type allows all three variants. Token shape-before-hash
ordering is memorized at 3 call sites; the guard+decorator pair is 2 modules for
1 line per handler.

Solution (plain English): deepen one workspace resolution module owning token
shape, hashing, LTI-key lookup, and projection; keep the HTTP guard and the
socket adapter as thin adapters over its interface; fold the decorator pair
inside; route workshop `join` through the canonical creation path.

Benefits:

- locality: auth divergence (projection set vs missing vs recomputed) fixed once.
- leverage: one interface, HTTP + WS + join call sites.
- Tests assert projection per credential kind (bearer / LTI editor / LTI student)
  through one interface; adapter specs pin transport mapping only.

Verification: `workspace-token`, `workspace.service`, `workspace.guard` suites
plus a new resolution interface spec (projection matrix) and a
`websocket-cookie.adapter` spec; then `yarn test:backend`. Informed by ADR-0001
(identity from credential, never from id) — deepens it, no conflict.

---

## 3 · Deepen the provider runtime (Strong, mock)

Files:

- `packages/backend/src/provider/provider.service.ts` (424; seeds, `initialize`,
  `validate`, `backfillMissingPolicies`, crypto, runtime projection)
- `packages/backend/src/provider/provider-runtime.service.ts` (327; `catalog`
  5s TTL, `probe` 5s timeout, `complete`, `acquireProviderPermit`,
  `invalidateCatalog`; `complete` re-calls `catalog()` after the policy check)
- `packages/backend/src/provider/model-policy.ts` (36; `permitsModel`,
  `toModelPolicy`; no spec; unchosen-`null` vs `DENY_ALL` distinction)
- `packages/backend/src/provider/provider-credential-cipher.ts` (70)
- `packages/backend/src/provider/execution-limits.service.ts` (68; 5s cache)
- `packages/backend/src/common/concurrency-gate.ts` (84)
- `packages/backend/src/provider/provider.controller.ts` (43; must remember
  `runtime.invalidateCatalog()`), `model.controller.ts` (12, verbatim
  pass-through), `execution-limits.controller.ts` (20); no controller specs.

Problem: the 36-LOC policy module is shallow — the 3-line predicate plus
null-coalescing must be understood in `validate` (blocks enabling cloud when
`mode === null`), the catalog filter, and the `complete` pre-check. Liveness and
policy are double-queried; stale-cache serving is a caller-remembered side
effect. `ProviderService` mixes seeding, crypto, validation, and runtime
projection; env, Prisma, and the cipher envelope meet in one class.

Solution (plain English): deepen the provider runtime module so policy, catalog
cache, permit gate, and invalidation sit behind its seam; split seeding out of
the runtime; inject the external provider (OpenAI/OpenRouter/compatible/worker)
as an adapter with a mock adapter in tests.

Benefits:

- locality: policy + gate change together; seeding changes alone.
- leverage: catalog + execution share one gate and one cache.
- Stale-cache class of bug disappears (invalidation encapsulated, not remembered).
- Tests use the mock adapter — no timing-sensitive fetch stubs.

Verification: `provider.service`, `provider-runtime.service`,
`provider-credential-cipher` suites; add a `model-policy` spec and a runtime
interface spec against the mock adapter (policy matrix × gate); then
`yarn test:backend`. Keeps the ADR-0008 guarantee (server-side enforcement in
both catalog and `complete()`) in one place.

---

## 4 · Collapse the template-content kernel (Worth exploring, in-process)

Files:

- `packages/backend/src/template/template-content.ts` (418; `GraphContent`,
  `GraphNode`, `parseGraphContent`, `hashContent`, `graphNodeTypes`,
  `graphModelNodes`, `validateNestedGraph`; structural `[key: string]: unknown`)
- `packages/backend/src/template/template.service.ts` (421; validate/normalize)
- `packages/backend/src/template/template.serializer.ts` (43; `TemplateRow =
  Awaited<ReturnType<TemplateService['findById']>>` — interface equals
  implementation)
- `packages/backend/src/template/template-seed.service.ts` (124; reads past the
  service into Prisma + `hashContent`)
- `packages/backend/src/core/subgraph-compiler.ts` (469; second consumer of the
  shape with a different `registeredType` callback)
- `packages/backend/src/workshop/workshop-readiness.service.ts` (263; third
  consumer: `templateCheck`/`nodeTypeCheck`/`modelCheck` with a live
  `runtime.catalog()` probe; heavily mocked spec)
- `packages/backend/src/migration/transform-llm-model-ref.ts` (131; fourth
  consumer, raw-JSON mutation)
- `packages/backend/src/workflow/workflow.service.ts` (`createFromTemplate` vs
  workshop `join`'s bare `slugify` without `dedupeSlug`/retries — same bypass class)

Problem: one graph shape is parsed, validated, compiled, inspected, and mutated
by four modules that must agree on `graph/subgraph`, `graph/input|output`, and
`models/llm` conventions through a stringly-typed contract. Three spec files pin
the same fixtures separately; the serializer is a field map tied to the service
return type; the seeder bypasses the service for reads.

Solution (plain English): deepen a graph content module owning parse, validation,
hashing, node/model queries, and migration transforms; route the compiler,
readiness, serializer, seeder, and join path through it so shape changes land once.

Benefits:

- locality: `graph/subgraph` convention changes land in one module.
- leverage: one query interface (`parse`/`nodeTypes`/`modelNodes`/`migrate`),
  4 callers.
- Join path stops bypassing creation rules (`dedupeSlug`, retries, room caps).
- Tests pin fixtures once at the content interface.

Verification: `template-content`, `template.service`, `subgraph-compiler`,
`workshop-readiness` suites; add a content-interface fixture test shared by all
four consumers; then `yarn test:backend`.
ADR note: touches ADR-0003 (immutable revisions) — migration rewrites revision
rows today under a comment exception ("schema conversion is not a content
change"). Worth reopening because a content module could version transforms
instead of mutating; mark the callout in the grill.

---

## 5 · Deepen the editor run sync (Worth exploring, in-process)

Files:

- `packages/frontend/src/pages/Editor.tsx` (604; owns `LGraph`, 3 fetches,
  5 hooks, 12 callbacks; reaches into `canvas.ds`, `lgraph.getNodeById`,
  `node.properties.templateBlock/templateBoundary`)
- `packages/frontend/src/hooks/useServerEvents.ts` (229; 16-field result, 6
  fields dead in the prod path; `colorNode` mutates
  `lgraph.getNodeById().color` inside the socket handler)
- `packages/frontend/src/hooks/useSocket.ts` (68) + `utils/socket.ts` (49;
  `getSocket(token)` ignores token on second call; `emitEvent` silently no-ops;
  untested)
- `packages/frontend/src/hooks/useAutosave.ts` (112; `JSON.stringify(graph.serialize())`
  every 1000ms; zero tests; `SaveStatus` strings mirrored in the toolbar)
- `packages/frontend/src/hooks/useWorkflowForm.ts` (59; second poller, same
  `graph.serialize()` every 400ms; Editor merges server `maxInputChars` with
  untested precedence)
- `packages/frontend/src/hooks/useGraphHistory.ts` (68) +
  `utils/graphHistory.ts` (145; `begin/end` nesting, `restoring` guard, and
  canvas integration untested)
- `packages/frontend/src/hooks/useGraphOperations.ts` (54; **zero imports** —
  dead duplicate of Editor import/export that skips validation, history, and
  canvas dirty)
- `packages/frontend/src/components/Canvas.tsx` (111; imperative wrapper,
  unstable-callback `useEffect`s, never-true cleanup; zero tests)

Problem: the editor run/sync modules are shallow — two `serialize()` pollers
race, the socket singleton ignores its token, the event result carries dead
fields, network code mutates canvas color across the seam, and the debug bridge
ties socket setup to autosave state. `useGraphOperations` fails the deletion
test in reverse: deleting it changes nothing.

Solution (plain English): deepen one editor sync module owning run correlation
and save state; demote socket and persistence to adapters behind its seam;
notify canvas instead of mutating it; delete the dead graph-operations duplicate;
collapse the two pollers into one observed change source.

Benefits:

- locality: run/save races and precedence merges fixed in one module.
- leverage: one render seam for toolbar + task/trace views.
- Dead duplicate deleted, not maintained.
- Tests drive sync without sockets or canvas (in-memory adapters).

Verification: `useServerEvents`, `useWorkflowForm`, `graphHistory`,
`NodeInspector`/`NodePalette`/`EditorToolbar` suites; add sync-module tests
(run correlation, save-state machine, precedence merge) with fake timers and
in-memory adapters; delete `useGraphOperations.ts`; then `yarn test:frontend`.

---

## 6 · Retire the dead lib seam; widen node hydration (Speculative, in-process)

Files:

- `packages/lib/src/web/websocket.ts` (58; `sendWs`/`handleWsRequest` — zero
  callers outside the file), `web/rest.ts` (5; unused `GraphSchema`),
  `web/types/SelectiveGraphData.ts` (129; `GraphSerializer` lossy, zero callers)
- `packages/lib/src/nodes/types/ModelRef.ts` (99; `ModelCompletionRuntime` — 1
  prod adapter in `provider-runtime.service.ts`, fakes only in specs;
  hypothetical seam until a second adapter arrives)
- `packages/lib/src/nodes/LLMNode.ts` (159; `runtime?`, `setRuntime`,
  `setModelCatalog` with zero callers)
- Backend hydrate: `graph-handler.service.ts` `addOnNodeAdded` +
  `hydrateExistingNodes` (`(lgraph as any)._nodes`, `node.env`, `instanceof
  LLMNode` + direct `node.properties` mutation in 6+ places);
  `benchmark.service.ts` repeats the pattern without env/runtime.
- Frontend shadows: `utils/graphBlocks.ts` vs `lib/.../BlockInterface.ts`,
  `Editor.tsx` `parseWorkflow` vs backend `parseGraphContent`,
  `NodeInspector.tsx` property branches vs registry definitions.
- `SentenceTransformer`/`KeywordCheckNode` bypass the completion seam via direct
  `fetch` to a hardcoded worker URL; several node modules import `ws`/DOM
  values the headless backend never honors.

Problem: the lib ships a hypothetical seam with zero adapters (`web/` over `ws`
nobody honors) while the real node seam leaks — backends reach past the
interface with `instanceof` + property mutation and frontends shadow its types.
`ModelCompletionRuntime` has one prod adapter: introducing a port there today
would be indirection, not depth.

Solution (plain English): delete the dead `web/` modules (deletion test:
complexity vanishes); widen an honest hydrate/execute seam so `env` and runtime
flow through the lib interface instead of `any` casts; leave the completion
seam single-adapter until a second adapter (e.g. worker-backed completion)
earns it; converge frontend/backend graph types onto the lib definitions.

Benefits:

- locality: node wiring lives in lib, not in 6 backend call sites.
- leverage: one hydrate, backend + benchmark + tests.
- No hypothetical ports introduced — seam discipline holds.
- Lib gains its first real interface tests (currently zero `*.spec.ts` in
  `packages/lib`; only consumers test it).

Verification: rebuild `@haski/ta-lib` first (`yarn workspace @haski/ta-lib
build`), then backend run-path + frontend graph suites; confirm zero references
to `web/` before deleting; then `yarn build` + `yarn typecheck`. Verified
during review: `useGraphOperations` has 1 match (its own definition),
`sendWs`/`GraphSerializer` have matches only in `lib/` itself, `setModelCatalog`
has 1 match (its own definition in `LLMNode.ts`).

---

## Top recommendation

Tackle **candidate 1 first** — collapse the graph run path. Every execution pays
the 7-module bounce; xAPI duplication and benchmark divergence are live
correctness risks, not taste; and a run/cancel interface is verifiable
end-to-end with a mock completion adapter. Take **candidate 2** (workspace
resolution) in the same wave: same leak class on the auth surface, small enough
to land alongside.

## Working agreements for the grill

- Do NOT propose interfaces yet — grill the picked candidate first (constraints,
  dependencies, shape of the deepened module, what sits behind the seam, what
  tests survive).
- Replace, don't layer: new tests at the deepened interface; delete old shallow
  unit tests once interface tests exist.
- One adapter = hypothetical seam. Do not introduce a port without two adapters
  (prod + test counts).
- Naming a deepened module after a concept not in the domain language: add the
  term to the project glossary discipline (create lazily, same as grill-with-docs).
- Rejecting a candidate for a load-bearing reason: offer an ADR so future
  reviews don't re-suggest it (skip ephemeral "not now" reasons).
