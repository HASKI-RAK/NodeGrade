# NodeGrade (automatic short answer grading tool)

## Overview

NodeGrade automates short-answer grading with node graphs. Facilitators sign in at
`/admin`, create a workshop from a published template revision, and hand out an
eight-character code; each participant browser gets an isolated workspace with its own
workflow copy, edits it in a LiteGraph editor, and runs it against LLM and NLP providers.

Following articles have been published concerning this project:

- [Enhancing NLP-Based Educational Assessment: A Node-Based Graph Approach for Analyzing Freeform Student Texts](https://ieeexplore.ieee.org/document/10569607)

---

This monorepo, named `NodeGrade`, holds a NestJS 12 + Prisma 7 + PostgreSQL backend, a
React 19 + Vite 8 + MUI 7 + litegraph.js PWA frontend, a shared graph/event library
(`@haski/ta-lib`), an LTI 1.3 library (`@haski/lti`), and a Python Flask
sentence-embedding worker.
Created and maintained by David Fischer.

![Thumbnail](.github/thumbnail.png)

## Features

- **Workshops:** `DRAFT` / `PUBLISHED` / `CLOSED` lifecycle, eight-character join codes,
  per-browser isolated workspaces, entry preflight and facilitator readiness panel
  (backend, template, node types, models).
- **Templates:** `WORKFLOW` and `BLOCK` kinds, immutable revisions, gallery at
  `/templates`, block insertion with boundary ports and provenance, bundled seeding.
- **Editor:** node palette, inspector, autosave with `Saved` indicator, optimistic
  `ETag` / `If-Match` saves, Preview + Run assessment, per-node Trace.
- **Providers:** `local` / `OpenAI` / `OpenRouter` / OpenAI-compatible endpoints,
  encrypted API keys, `DENY_ALL` / `ALLOWLIST` / `ALLOW_ALL` model policies enforced
  server-side on catalog and execution, deployment-wide execution limits.
- **Integrations:** LTI basic launch to `LTI` workspaces, xAPI initial + completed
  statements, 60-day workspace retention, room-tolerant creation throttling.

**Who this is for:** facilitators and participants start at
[Running a workshop](#running-a-workshop) and
[Instructions for participants](#instructions-for-participants); developers and operators
start at [Getting Started](#getting-started) and [Deployment](#deployment).

How it fits together: `docs/architecture.md` (runtime, transports, execution flow),
`docs/module-map.md` (where code lives), `specs/index.md` (all waves implemented),
`docs/adr/` (decisions ADR-0001 through ADR-0008).

## Getting Started

### Prerequisites

- Node.js 18 or later
- Yarn 4 (or Corepack)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/HASKI-RAK/NodeGrade.git
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```
3. Create a `.env` file in the `packages/backend` directory and add the following content:
   ```bash
   DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/DATABASENAME?schema=public"
   ```
   Replace the connection string with your own database connection string.
4. Generate the Prisma client and apply the migrations:
   ```bash
   yarn setup
   ```

### Running the Project

To run the project in a development environment, use the following command in the root directory:

```bash
yarn dev
```

This will launch both the server and the frontend PWA in development mode.

`yarn dev` does not start the NLP worker. Without it the embedding, keyword and
equivalence nodes have nothing to call — and if `SIMILARITY_WORKER_URL` is unset the
backend silently falls back to a remote host that is not yours, so those nodes keep
working while every answer they touch leaves your machine. The backend logs a warning at
startup when that happens.

Either point `SIMILARITY_WORKER_URL` at the debug stack (`yarn debug:up`, deterministic,
no model download) or run the real worker beside `yarn dev`:

```bash
cd models
python -m venv .venv && .venv/bin/pip install -r requirements.txt   # Windows: .venv/Scripts/pip
cp .env_template .env        # defaults are fine; HF_HOME needs a writable path
.venv/bin/python model_worker.py
```

First boot downloads `BAAI/bge-m3` (2.3 GB) before `/health` answers; the entailment
model loads on the first `/entailment` request, not at startup. Then set
`SIMILARITY_WORKER_URL="http://127.0.0.1:8002"` in your backend `.env`.

### Workshop flow

Workshops move `DRAFT` → `PUBLISHED` → `CLOSED`. Facilitators sign in at `/admin`,
create a workshop from a published template revision, and publish its eight-character
code. Participants enter the code at `/` or open `/workshop/<code>`; entry runs a
preflight (backend, template, node types, models) and only then mints an isolated
workspace with its own workflow copy. Closing stops new joins; handed-out workspaces
keep their content until retention removes them.

Workflow persistence uses REST with `If-Match` / `ETag` optimistic versions. Graph
execution uses Socket.IO (`runGraph` / `cancelRun`, `runStateChanged` /
`nodeExecutionChanged` / `outputSet` / `graphFinished`) and a workspace-scoped
workflow ID.

See [Running a workshop](#running-a-workshop) for the facilitator checklist and
[Instructions for participants](#instructions-for-participants) for the handout text.

### Benchmarking

Facilitator-authenticated benchmark runs use `POST /api/benchmark/run` with the following body:

```json
{
  "workflowId": "<workflow-id>",
  "data": {
    "question": "What is 1+1?",
    "realAnswer": "2",
    "answer": "2"
  }
}
```

The request uses the facilitator session and CSRF header from the admin API.

> Note: The graph has to have the following nodes for the benchmark to work: "Answer Input", "question", "feedback output". You can use multiple of these nodes.

## Structure

The project is structured into Yarn 4 workspaces under `packages/*`, plus the embedding
worker, specs, and tooling.

### Backend

NestJS 12 + Prisma 7 + PostgreSQL in `packages/backend/src/` (`main.ts`,
`app/app.module.ts`). REST persists workflows with `If-Match` / `ETag` optimistic
versions; Socket.IO (`graphgateway/`, `core/Graph.ts`) runs graphs and streams trace
events typed in `@haski/ta-lib`. Modules: `auth/` (facilitator sessions + CSRF),
`workspace/` (tokens, guards, retention), `workflow/` (CRUD, slugs, draft vs published
projection), `template/` (immutable revisions, gallery, bundled seeding), `workshop/`
(lifecycle, join codes, readiness), `provider/` (credentials, catalog, model policy,
execution limits), `migration/` (content backfills), `lti/`, `benchmark/`.
Backend is ESM: relative imports carry a `.js` extension. Never edit
`src/generated/prisma` or `dist/` by hand.

### Frontend PWA

React 19 + Vite 8 + MUI 7 + litegraph.js in `packages/frontend/src/` (`main.tsx`,
`routes.tsx`). Routes: `/` code entry, `/workshop/:code` join, `/templates` gallery,
`/workflows` list, `/editor/:workflowId` and `/student/:workflowId` editor,
`/admin/workshops|providers|templates`, `/lti/register`. The editor
(`pages/Editor.tsx`, `components/editor/`) offers palette, inspector, rail, and toolbar
with autosave; Preview runs an assessment and Trace shows per-node steps. Server calls go
only through `api/http.ts` and `utils/socket.ts`; sessions live in
`store/workspaceSession.ts` and `store/workspaceStore.ts`.

### Shared libraries and workers

- `packages/lib/src/` (`@haski/ta-lib`): the single source of node types (`nodes/` +
  `NodeDefinitionRegistry.ts`), model refs, and the socket event contract
  (`events/ServerEvents.ts`). After editing it, run
  `yarn workspace @haski/ta-lib build` before trusting backend typecheck or tests.
- `packages/lti/` (`@haski/lti`): LTI 1.3 launch handling used by the backend.
- `models/`: Flask + sentence-transformers embedding/similarity worker
  (`models/Dockerfile` builds it).
- `packages/backend/prisma/`: schema + migrations; `e2e/`: Playwright browser coverage;
  `tools/debug/`: deterministic debug stack; `tools/spec-lint/`: `specs/` consistency
  linter; `specs/`, `docs/adr/`: requirements and decisions.

## Example Usage

1. Run `yarn debug:up`.
2. Open <http://localhost:15173/>.
3. Join a seeded workshop: `WAVE-2026` for the minimal three-node graph, or `WAIE-2026`
   for the full rubric, classification and feedback workflow.
4. Select a node on the canvas. The inspector on the right edits its properties; the model
   nodes in `WAIE-2026` ship unselected, so pick `nodegrade-deterministic` before running.
5. Edit the workflow and wait for the `Saved` indicator.
6. Press **Preview**, write an answer, and press **Run assessment**. The **Trace** tab
   shows each node as it executes; clicking a step selects that node on the canvas.

The debug stack answers every model call from a deterministic worker, so results are the
same on every run and no API key is needed.

## Docker

`yarn debug:up` starts PostgreSQL, the backend, frontend, and deterministic
OpenAI-compatible model worker (ports `15xxx` / `18000`). `yarn debug:status` and
`yarn debug:logs` inspect it, `yarn debug:down` stops it, and `yarn debug:reset`
recreates its database.

## Providers and model governance

Providers live in `/admin/providers`: `local` (from `MODEL_WORKER_URL`), `OpenAI`,
`OpenRouter`, and custom OpenAI-compatible endpoints. API keys are stored AES-256-GCM
encrypted in `Provider.apiKeyEnc` and never returned by an API; nodes receive
credentials only through the injected `ModelCompletionRuntime`. Seeded cloud providers
start `DENY_ALL`; the local worker starts `ALLOW_ALL`.

Each provider carries a model policy, enforced server-side in `ProviderRuntimeService`
on both the catalog (`GET /api/models` returns only permitted models) and execution
(`complete()` refuses an excluded `ModelRef` before any request leaves the process).
Editor filtering is presentation only:

- `DENY_ALL`: participants get nothing from this provider.
- `ALLOWLIST`: only the listed model ids may run.
- `ALLOW_ALL`: every catalog model may run.

A deployment-wide execution-limits singleton caps in-flight runs per workspace and holds
a permit gate in front of provider requests; both are re-read per request, so a saved
change applies without a restart.

## LTI, xAPI, retention, and limits

- **Workspaces:** `BROWSER`, `WORKSHOP`, and `LTI` kinds. Participant authorization comes
  from the bearer access token only (`WorkspaceGuard` + `@CurrentWorkspace()`); no
  handler takes a workspace id from path, query, or body.
- **LTI:** a basic launch maps to an `LTI` workspace (editor or published projection via
  the launch cookie) and registration lives at `/lti/register`.
- **xAPI:** graph runs emit initial + completed statements when `XAPI_ENDPOINT`,
  `XAPI_USERNAME`, and `XAPI_PASSWORD` are set.
- **Retention:** idle browser workspaces and ended workshop workspaces are deleted after
  60 days (sweep every 6h; `RETENTION_ENABLED=false` keeps everything). `LTI` workspaces
  are never swept.
- **Abuse guards:** one workspace holds at most `WORKSPACE_MAX_WORKFLOWS` workflows
  (default 50, `LTI` exempt); one address may create `WORKSPACE_CREATE_MAX` workspaces
  per `WORKSPACE_CREATE_WINDOW_MS`, sized so a whole room arriving at once still joins.

## Deployment

`docker-compose.yml` builds and runs the deployable stack: PostgreSQL, the sentence-
transformer worker on port 8002, the backend on port 5000, and the frontend on port 8080.
The backend reaches the embedding worker through the Compose network at `models:8002`.
The frontend nginx container forwards `/api`, `/socket.io`, `/lti`, and `/health` to the
backend over the Compose network, so browsers use the frontend's public origin.
`MODEL_WORKER_URL` is an optional external OpenAI-compatible text-generation
endpoint offered as the `local` provider; it stays empty unless a deployment
provides one.

```bash
PROVIDER_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=') \
  docker compose up --build -d
```

The Compose defaults target local HTTP at `http://localhost:8080` and set
`COOKIE_INSECURE=true`. For a public HTTPS deployment, set `FRONTEND_URL` and
`CORS_ORIGIN` to the public origin and set `COOKIE_INSECURE=false`.

Configure the backend through the environment (`.env_template` lists every variable):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Required. |
| `PROVIDER_ENCRYPTION_KEY` | Base64url-encoded 32-byte key encrypting stored provider API keys. Required, and **stable for the life of the deployment** — changing it makes every stored key undecryptable. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Facilitator sign-in at `/admin`. Without them the admin area stays disabled. |
| `FRONTEND_URL`, `CORS_ORIGIN` | Public origin of the frontend, and the origins allowed to call the API. |
| `MODEL_WORKER_URL` | An OpenAI-compatible endpoint offered as the `local` provider. |
| `SIMILARITY_WORKER_URL` | The NLP worker (`models/`) behind the embedding, keyword and equivalence nodes. |
| `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | Seed credentials for the cloud providers. A seeded cloud provider starts with its model policy set to deny-all; a facilitator opens it in `/admin/providers`. |
| `BEARER_TOKEN` | Auth for a custom OpenAI-compatible endpoint, when needed. |
| `ADMIN_SESSION_TTL_HOURS` | Facilitator session lifetime in hours (default 8). |
| `COOKIE_INSECURE` | Issue cookies without `Secure`. Needed for plain HTTP on localhost; must stay false anywhere reachable over a network. |
| `RETENTION_ENABLED` | Delete idle browser and ended workshop workspaces after 60 days (default true). |
| `WORKSPACE_MAX_WORKFLOWS` | Max workflows per participant workspace (default 50; LTI exempt). |
| `WORKSPACE_CREATE_MAX`, `WORKSPACE_CREATE_WINDOW_MS` | Max workspaces one address may create per window (room-tolerant join throttle). |
| `TEMPLATE_SEED_ENABLED` | Install bundled templates on startup; only appends, never overwrites facilitator edits. |
| `XAPI_ENDPOINT`, `XAPI_USERNAME`, `XAPI_PASSWORD` | xAPI LRS receiving initial + completed run statements. |

The NLP worker itself reads five variables of its own (set on the `models` service, not
the backend):

| Variable | Purpose |
|---|---|
| `EMBEDDING_MODEL` | Sentence-embedding model (default `BAAI/bge-m3`; multilingual, MIT). |
| `EMBEDDING_MAX_SEQ_LENGTH` | Token cap per input (default 512), which bounds CPU latency. |
| `EMBEDDING_TASK` | Task name for task-conditioned models, e.g. `text-matching`. Empty for models that take none, which is most of them. |
| `EMBEDDING_TRUST_REMOTE_CODE` | Allow the model repository to execute its own Python on load. Default `false`. |
| `NLI_MODEL` | Entailment cross-encoder behind `/entailment`, loaded on first use. Set it empty to disable the stage; `text/semantic-equivalence` then falls back to its cosine ceiling. |

Model choice is measured, not assumed:
[docs/embedding-model-comparison.md](docs/embedding-model-comparison.md) ranks six models
across the four comparisons the graph performs, and
[docs/semantic-equivalence-calibration.md](docs/semantic-equivalence-calibration.md)
records where the thresholds come from. `models/compare_models.py` and
`models/calibrate.py` reproduce them.

### Choosing a different embedding model

No model weights ship in this repository. The worker downloads whatever
`EMBEDDING_MODEL` names from Hugging Face at startup, which means the licence that
applies to your deployment is the licence of the model you choose, and accepting it is
your decision rather than this project's. The defaults are MIT on both models so that
every deployment can use them unchanged.

Six candidates are measured across the four comparisons the graph performs in
[docs/embedding-model-comparison.md](docs/embedding-model-comparison.md). Two results
decide most overrides:

- `intfloat/multilingual-e5-large-instruct` is the strongest embedding measured, and it
  is **MIT**. It wins on raw similarity and loses inside the full cascade, so prefer it
  when your workflow scores with `models/cosine-similarity` or `text/keyword-check`
  rather than with `text/semantic-equivalence`.
- Model choice is worth a few points; staging the decision is worth thirty. Across six
  models raw cosine spans 28 points of accuracy on the same pairs and the cascade spans
  11, with the ranking inverted between them.

`jinaai/jina-embeddings-v3` is the model whose licence question comes up most often, and
it does **not** win: `e5-large-instruct` beats it on three scenarios of four. Its weights
are **CC-BY-NC-4.0**, which permits non-commercial use with attribution; attribution
alone does not extend it to commercial use. If your deployment is non-commercial — a
university course, an internal research pilot — it may be available to you. Read the
licence and decide for your own context; if money changes hands anywhere near the
deployment, get that decision reviewed by someone qualified rather than relying on this
paragraph. Since a permissively licensed model measures better here, the simplest answer
is not to need the review.

To run it anyway:

```yaml
environment:
  EMBEDDING_MODEL: jinaai/jina-embeddings-v3
  EMBEDDING_TASK: text-matching
  EMBEDDING_TRUST_REMOTE_CODE: 'true'
```

`EMBEDDING_TRUST_REMOTE_CODE=true` lets `transformers` download and execute Python from
the model repository inside the worker process. Jina v3 requires it because its
architecture lives next to the weights rather than in `transformers` itself, and it pulls
that code from a *second* repository, `jinaai/xlm-roberta-flash-implementation`. Enable it
only for repositories you have reason to trust, pin a revision if you can, and never
enable it together with an `EMBEDDING_MODEL` value that anything outside your deployment
can influence.

Measure before switching, on your own pairs:

```bash
python models/compare_models.py --models <repository-id>
```

Apply schema migrations on every release, before the new backend serves traffic:

```bash
yarn workspace backend exec prisma migrate deploy
```

Release checklist:

1. `yarn build && yarn typecheck && yarn lint:check && yarn test` pass.
2. Migrations applied against the target database.
3. `/health` returns `{"status":"ok"}` on the backend.
4. `/admin` accepts the configured facilitator credentials.
5. At least one provider is enabled with a model policy, and the readiness panel of the
   workshop you are about to run reports all checks green.

## Running a workshop

1. **Sign in.** Open `/admin` and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
2. **Open a provider.** In **Providers**, enable the provider you intend to use and set its
   model policy — *allow all*, or an *allowlist* of the model ids participants may run. A
   provider with no policy mode offers participants nothing, by design.
3. **Create the workshop.** In **Workshops**, give it a title, pick a published template
   and one of its revisions, and press **Create workshop**. The revision is frozen: later
   edits to the template never change a running workshop.
4. **Check readiness.** Each workshop shows a readiness panel covering the backend, the
   template, the node types this build registers, and whether any model is available. Fix
   anything red before the room arrives; participants hit the same checks on entry.
5. **Publish.** Press **Publish** to hand out the eight-character code. Participants can
   only join a published workshop.
6. **Close.** Press **Close** when the session ends. The code stops working; workspaces
   already handed out keep their content until retention removes them.

## Authoring a template

Template revisions are immutable (ADR-0003): new content is always a new revision, never an
edit of an existing one. Templates come in two kinds: `WORKFLOW` (a whole assessment) and
`BLOCK` (a reusable capability with declared inputs/outputs). The gallery at `/templates`
lists published templates with node/link previews; inserting a block remaps identities,
places content near the viewport, suggests connections, records provenance, and undoes in
one step. Subgraph-wrapper blocks are an expansion track; see
`docs/subgraph-template-block-plan.md`. There are two ways in.

**Ship it with the deployment.** Add a module to
`packages/backend/src/template/bundled/` exporting a `BundledTemplate`, and list it in
`bundled/index.ts`. The seeder installs it on startup, publishes it on first install, and
afterwards only appends a revision when the bundled content actually changed. It leaves a
template alone once a facilitator has edited it. `waie-assessment.ts` is the worked
example.

**Author it from the editor.** Build the graph in the editor, press **Export** to download
its JSON, then post it as a facilitator:

```bash
# Sign in; the cookie jar carries the session and the CSRF cookie.
curl -c jar.txt -X POST http://localhost:5000/api/admin/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"...","password":"..."}'

curl -b jar.txt -X POST http://localhost:5000/api/admin/templates \
  -H 'content-type: application/json' \
  -H "X-CSRF-Token: $(grep ng_admin_csrf jar.txt | cut -f7)" \
  -d "$(jq -n --slurpfile content workflow.json \
        '{slug:"my-workshop", kind:"WORKFLOW", name:"My workshop", published:true,
          content:($content[0]|tostring)}')"
```

A later revision of the same template is `POST /api/admin/templates/<id>/revisions` with
the same body shape. `POST /api/admin/templates/<id>/published` controls whether it appears
in the gallery at `/templates`.

Two rules are worth knowing before you author:

- **Leave model nodes unselected.** Set `needs_model_selection: true` and no `model_ref`.
  Which models may run is decided server-side per deployment (ADR-0008), so a model id
  baked into shipped content produces a run that fails at execution time somewhere else.
- **Only use registered node types.** The readiness check refuses a workshop whose template
  uses a node type this build does not register, because LiteGraph would otherwise drop
  those nodes silently.

## Instructions for participants

Hand out the code and these five lines:

1. Open **<https://your-deployment.example>** and type the code **`ABCD-EFGH`** into
   *Workshop code*, then press **Join**. The dashes are optional.
2. You now have your own private copy of the workflow. Nobody else sees your edits, and
   nothing you do affects anyone else in the room.
3. Click a node to edit it in the panel on the right. The editor saves by itself; the
   toolbar says `Saved` when your work is stored.
4. Press **Preview**, write an answer the way a student would, and press
   **Run assessment**. An assessment can take up to two minutes — do not reload the page.
   The **Trace** tab shows what each node did.
5. If you close the tab, open the same link in the *same browser* to get your work back. A
   different browser, a different device, or a private window gets a fresh copy.

## Scripts

- **Development**: `yarn dev` - Runs both the server and frontend in development mode.
- **Build**: `yarn build` - Topological build of all workspaces.
- **Typecheck**: `yarn typecheck` - Backend plus frontend `tsc --noEmit`.
- **Lint**: `yarn lint:check` - ESLint with zero warnings (backend plus frontend).
- **Unit tests**: `yarn test` - Backend jest plus frontend vitest.
- **Database integration**: `yarn test:int` - Backend `*.int-spec.ts` against debug Postgres on 15432.
- **Browser smoke tests**: `yarn test:e2e` - Playwright in Chrome and Firefox; boots the debug stack itself.
- **Specification lint**: `yarn lint:specs` - Checks `specs/` for structural consistency (`yarn test:specs` covers it).

Pull requests run the typecheck, lint, unit test, build, browser smoke test and
specification lint jobs in `.github/workflows/pr.yml`. Making them block a merge is a
repository setting rather than a file; see `.github/rulesets/`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Citation
If you use this work, pleace cite the corresponding paper:
```bib
@inproceedings{10.1145/3723010.3723021,
author = {Fischer, David Vincent and Haug, Jim and Schoppel, Paul and Abke, J\"{o}rg and Becker, Matthias and Hagel, Georg},
title = {Evaluation of a Node-based Automatic Short Answer Tool “NodeGrade”},
year = {2025},
isbn = {9798400712821},
publisher = {Association for Computing Machinery},
address = {New York, NY, USA},
url = {https://doi.org/10.1145/3723010.3723021},
doi = {10.1145/3723010.3723021},
abstract = {NodeGrade tries to provide a suitable solution for the problem of time-intensive short answer grading. This research focuses simultaneously on performance, functionality and user experience, which is underlined by a triangulated approach. The evaluation results show comparable performance of NodeGrade on public datasets, even outperforming GPT-4 on the SemEval 2013 Task 7. Matching of NodeGrade’s output with multiple human expert raters reveals some weaknesses regarding cases at the lower and upper boundary. In terms of user experience, the interviewed and observed students recognized both positive facets, like better learning support and helpful feedback, and negative sides, including technical limitations and lack of transparency. Overall, NodeGrade promises high potential for further practical use and testing in the field of software engineering education and automatic short answer grading.},
booktitle = {Proceedings of the 6th European Conference on Software Engineering Education},
pages = {20–29},
numpages = {10},
keywords = {ASAG, Automatic Short Answer Grading, Short Answer Scoring, AI in Education, Software Engineering Education, Natural Language Processing, Large Language Models},
location = {
},
series = {ECSEE '25}
}
```
Which can also be found at: https://dl.acm.org/doi/10.1145/3723010.3723021
### Credits

Porter Stemmer by Martin Porter 1980, used under the MIT License. Implementation from [James Aylett](https://tartarus.org/martin/PorterStemmer/js.txt) under the [copyright](https://tartarus.org/copyright). License noted in script.

### Tags
NodeGrade, ASAG, ASAG-F, automatic short answer grading, automatic short answer grading with feedback, freeform text grading, TAAB, task based automatic assessment
