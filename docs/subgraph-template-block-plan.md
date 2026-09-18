# Subgraph template blocks plan

## Purpose

Use LiteGraph.js Subgraph nodes as the editor representation for reusable block
templates. A participant inserts one meaningful block with a small, named
boundary. The block keeps its implementation graph available through an
explicit drill-down action.

This work is an expansion track for workshop learning and product discovery.
Existing specification acceptance gates are deferred while the interaction and
runtime model mature. Proven behavior can become updated requirements in
`SPEC-0003` after the vertical slice has been tested in a workshop.

## Workshop outcome

Block insertion should give participants a usable concept at the level of the
exercise:

- one canvas node named for the assessment capability;
- named input and output ports using workshop language;
- a few promoted settings needed for the exercise;
- an **Open block** action for inspecting or editing internals;
- provenance showing the source template and revision;
- grouped run traces such as `Feedback Generator / Feedback model`;
- one undo action for the whole insertion.

The main canvas then communicates workflow structure. Internal nodes remain
available for teaching moments and advanced exercises.

## Current fit

NodeGrade already supplies most of the required domain model and editor flow:

- templates have `WORKFLOW` and `BLOCK` kinds;
- template revisions are immutable;
- block content carries declared inputs and outputs;
- block insertion remaps identities, places content near the viewport, suggests
  connections, and records one history transaction;
- browser and server share LiteGraph node definitions through
  `@haski/ta-lib`;
- backend execution already hydrates serialized editor graphs and emits
  per-node traces.

Today, block insertion expands every internal node onto the main canvas. The
new adapter will create one `graph/subgraph` wrapper and place the copied block
graph inside it.

## Boundary contract

The existing block-template interface becomes the source of truth for Subgraph
ports.

Each boundary entry should contain:

```ts
type BlockBoundaryPort = {
  key: string
  label: string
  dataType: string
  direction: 'input' | 'output'
  internalNodeId: number
  internalSlot: number
  required?: boolean
  description?: string
}
```

Insertion derives:

- wrapper inputs and outputs from ordered boundary entries;
- internal `graph/input` and `graph/output` adapters;
- links between adapters and the referenced internal slots;
- stable boundary keys for serialization and future revision comparison;
- human labels for canvas ports and connection suggestions.

Wrapper metadata should include copied provenance:

```ts
type TemplateBlockProvenance = {
  templateId: string
  templateRevision: number
  templateName: string
  insertedAt: string
}
```

The copied graph remains self-contained. Later template revisions leave
existing inserted blocks unchanged.

## Editor design

### Insertion adapter

Extend `packages/frontend/src/utils/graphBlocks.ts` with a deterministic adapter
that:

1. validates the declared boundary against the block graph;
2. remaps all internal node and link identifiers;
3. creates and configures a `LiteGraph.Subgraph` wrapper;
4. creates boundary adapter nodes and internal links;
5. copies template provenance onto the wrapper;
6. places the wrapper at the current insertion point;
7. returns connection suggestions against wrapper ports;
8. completes inside the existing history transaction.

Keep this adapter owned by NodeGrade. LiteGraph.js `0.7.18`
`Subgraph.buildFromNodes()` is incomplete, so deterministic construction should
come from the block template contract.

### Canvas interaction

Update the editor integration in `packages/frontend/src/pages/Editor.tsx` and
`packages/frontend/src/components/Canvas.tsx`:

- double-click or **Open block** enters the subgraph;
- breadcrumb shows `Workflow / Block name`;
- **Back to workflow** restores the parent graph and viewport;
- wrapper title and port labels stay visible at normal workshop zoom;
- wrapper size grows to fit labels and promoted controls;
- selection and delete treat the wrapper as one canvas unit.

### Inspector

Update `packages/frontend/src/components/editor/NodeInspector.tsx` to show:

- block name and description;
- source template revision;
- boundary port help;
- promoted settings;
- **Open block** action;
- an advanced action for converting the wrapper to expanded nodes after the
  core flow proves useful.

Promoted settings need an explicit mapping from wrapper properties to internal
node properties. Introduce that mapping after the feedback-generator slice
establishes the required property shapes.

### Palette

Keep `packages/frontend/src/components/editor/NodePalette.tsx` as the discovery
surface. Block cards should preview:

- capability and learning purpose;
- required inputs and produced outputs;
- promoted settings count;
- internal node count as secondary detail.

Insertion creates the wrapper directly. Existing expanded block instances keep
their serialized form.

## Execution model

LiteGraph.js `0.7.18` runs a native Subgraph through synchronous
`subgraph.runStep()`. NodeGrade awaits asynchronous node execution, including
LLM requests. Server execution therefore needs a compilation step.

Before `executeLgraph` hydrates the graph, compile every Subgraph wrapper into
an ephemeral flat execution graph:

1. walk the serialized graph recursively;
2. validate every nested node type;
3. assign namespaced execution identifiers to internal nodes and links;
4. replace wrapper inputs and outputs with links through the boundary adapters;
5. copy internal nodes into the execution graph;
6. retain an execution-source map from flattened ids to wrapper and inner ids;
7. execute the resulting graph with the current async topological runner.

The persisted workflow remains encapsulated. The compiled graph exists for one
run.

Suggested execution identity:

```text
editor node:       42
inner node:        7
execution node:    sg:42/node:7
trace label:       Feedback Generator / Feedback model
```

Primary seams:

- load and hydration:
  `packages/backend/src/graphgateway/graph-handler.service.ts`;
- compilation and execution:
  `packages/backend/src/core/Graph.ts`;
- shared node registration:
  `packages/lib/src/nodes/LGraphRegisterCustomNodes.ts`;
- trace presentation:
  `packages/frontend/src/components/TraceView.tsx`.

## Validation and safety

Template validation in
`packages/backend/src/template/template-content.ts` should recurse through
Subgraph content and check:

- registered node types at every depth;
- unique ids within each graph scope;
- valid internal link endpoints and slots;
- boundary keys, directions, and referenced internal slots;
- acyclic Subgraph containment;
- a bounded nesting depth;
- JSON size and node-count limits across the full nested graph.

Execution compilation should return structured errors carrying the wrapper
path and inner node identity. Example: `Feedback Generator / Prompt Builder:
missing required input rubric`.

## First vertical slice

Use the bundled feedback-generator block in
`packages/backend/src/template/bundled/feedback-generator-block.ts`.

### Slice scope

1. Add an explicit boundary contract to its revision content.
2. Insert it as one Subgraph wrapper from the Blocks palette.
3. Show named wrapper ports and template provenance.
4. Enter and leave the nested graph through breadcrumb navigation.
5. Save, reload, undo, redo, copy, and delete the wrapper.
6. Compile it into a flat ephemeral graph on the backend.
7. Run its asynchronous LLM node successfully.
8. Present grouped traces in the participant UI.
9. Preserve existing expanded block instances.

### Discovery questions

- Which boundary labels make sense to novice participants?
- Which settings deserve promotion to the wrapper inspector?
- Does drill-down help teaching, or does it invite premature complexity?
- Do connection suggestions provide enough guidance at wrapper ports?
- Does grouped tracing preserve enough detail for debugging?
- When does a facilitator need nested blocks beyond one level?

## Delivery sequence

### 1. Contract fixture

- Define serialized boundary and provenance shapes.
- Update the feedback-generator fixture.
- Add round-trip tests for the nested serialized graph.

### 2. Editor wrapper insertion

- Build the NodeGrade Subgraph adapter.
- Reuse current placement, suggestions, selection, and history transaction.
- Add palette-to-wrapper tests.

### 3. Nested navigation

- Add graph-context state and breadcrumbs.
- Add inspector provenance and **Open block**.
- Verify autosave serializes the parent graph with nested content.

### 4. Recursive validation

- Validate nested types, links, boundaries, depth, and size.
- Extend workshop readiness to inspect nested node types and model references.

### 5. Async execution compilation

- Add a pure `compileEditorGraphForExecution()` module.
- Flatten nested graphs with namespaced ids and a source map.
- Execute through the existing awaited runner.

### 6. Trace projection

- Attach wrapper and inner identity to node lifecycle events.
- Group traces under the wrapper label.
- Keep raw inner detail available in expanded trace rows.

### 7. Workshop trial

- Run the same exercise with expanded and encapsulated insertion.
- Observe time to successful insertion, wiring errors, accidental edits, and
  requests for facilitator help.
- Record participant language for ports, controls, and breadcrumbs.
- Convert proven behavior into updated specification requirements.

## Verification targets

These targets guide the experiment while specification gates are deferred.

### Unit

- boundary-to-wrapper conversion is deterministic;
- ids remain unique across repeated insertions;
- serialization round-trips nested content and provenance;
- undo and redo treat insertion as one operation;
- recursive validation reports the full block path;
- compiler preserves topology and produces stable source mappings;
- async internal nodes complete through the current execution runner.

### Integration

- save and reload retain wrapper layout and internals;
- workshop readiness sees nested node types and model references;
- server run accepts the encapsulated graph and emits mapped traces;
- cancellation and timeout reach asynchronous inner nodes;
- execution limits apply equally to inner provider calls.

### Browser flow

1. Join a workshop.
2. Insert Feedback Generator from Blocks.
3. Connect its named boundary ports.
4. Open the block and inspect internals.
5. Return to the workflow.
6. Save and reload.
7. Run the workflow.
8. Inspect grouped traces.
9. Undo and redo insertion.

### Workshop evidence

Capture:

- median time from block selection to valid run;
- number of wiring errors;
- number of accidental internal edits;
- facilitator interventions per participant;
- participant explanation of the block boundary;
- successful recovery after opening internals.

## Main risks

### LiteGraph serialization drift

NodeGrade owns fixture tests around the exact serialized Subgraph shape used by
version `0.7.18`. Dependency upgrades run those fixtures before adoption.

### Editor and runtime semantic drift

One pure compiler and shared boundary types define the translation. Contract
tests run the same fixture through validation, compilation, and execution.

### Hidden complexity

Wrapper labels, boundary help, provenance, and grouped errors expose the
information required for workshop tasks. Drill-down provides the next level on
demand.

### Nested graph growth

Validation enforces depth, node-count, and serialized-size limits. The first
slice supports one nesting level; deeper nesting follows observed workshop
need.

### Trace identity collisions

Namespaced execution ids and an explicit source map keep lifecycle events
stable across repeated block insertions.

## Decision points after the trial

The workshop trial should decide:

- default insertion representation for new block instances;
- promoted-property schema;
- supported nesting depth;
- expanded-node conversion behavior;
- revision-difference and upgrade experience;
- final requirements and acceptance gates for `SPEC-0003`.
