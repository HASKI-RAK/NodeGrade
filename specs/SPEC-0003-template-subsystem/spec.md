---
id: SPEC-0003
type: feature
title: Template subsystem
status: implemented
parent: SPEC-0001
priority: P0
created: 2026-09-15
updated: 2026-09-16
depends_on:
  - SPEC-0004
  - SPEC-0013
related:
  - SPEC-0002
  - SPEC-0007
  - SPEC-0014
---

# Template subsystem

## Intent

### Problem

NodeGrade currently has one concept — a graph identified by a unique path holding a
serialized canvas blob. Importing a JSON file replaces the entire graph via
`configure()`. The workshop requires participants to adapt preconfigured workflows and
insert reusable assessment components (rubric scorer, feedback generator, validation)
without constructing them from low-level primitives.

### Desired outcome

Templates are a first-class domain concept with two kinds: complete workflow templates
(starting points) and insertable block templates (reusable subgraphs). Using a template
always creates a user-owned copy; inserting a block splices it into the current
workflow as one undoable operation.

## Scope

### In scope

- Template definition model: metadata (id, name, description, category, tags, type:
  workflow | block) plus graph content (nodes, links).
- Server-side persistence of templates as first-class entities; bundled templates are
  seed data for that store.
- Template revisions: a monotonic revision per template, where each modification
  creates a new immutable revision record; workflows and workshops reference the
  revision they were created from.
- Template gallery browsing with preview.
- "Use template" → duplicate into the user's workspace as a new editable workflow.
- "Reset to template" recovery action during a workshop (restores the revision the
  workflow was created from).
- Block templates with declared external interfaces (inputs/outputs) and
  connection suggestions on insertion.
- Canonical shipped block library covering the workshop exercise needs.
- Insert palette with tabs: Nodes | Blocks | Templates.

### Out of scope

- Full template version-management UI (a simple monotonic revision counter is in
  scope; see FR-018).
- Editing templates in place.
- Template marketplace or sharing between users.

## Actors

- Facilitator (admin): authors, modifies, publishes, and unpublishes templates; the
  only role allowed to change template definitions.
- Participant (anonymous): duplicates the workshop template, inserts blocks; cannot
  modify template definitions.
- Expert user: browses templates and blocks for general use; cannot modify template
  definitions.

## User scenarios

### US-001 — Start from a complete template

As a participant,
I want to pick a complete assessment workflow template and get my own editable copy,
so that I can adapt an existing strategy instead of building from primitives.

Priority: P1

Independent value: any user can bootstrap a working assessment workflow in one action.

### US-002 — Insert a reusable block

As a participant,
I want to insert a block such as "Rubric scorer" into my current workflow,
so that I can add a validation or review step without wiring low-level nodes.

Priority: P1

Independent value: enables the core workshop activity — changing one part of the
workflow.

### US-003 — Recover from mistakes

As a participant,
I want to reset my workflow back to its template,
so that I can recover when my edits have broken the graph mid-exercise.

Priority: P1

Independent value: critical for live workshops; prevents dead ends.

## Functional requirements

### FR-001 — Template definition

The system SHALL support template definitions consisting of metadata (unique id, name,
description, category, tags, type: workflow or block) and graph content (nodes and
links).

### FR-002 — Persistent template store

The system SHALL persist template definitions server-side as first-class entities.
Bundled templates SHALL seed this store on first startup.

### FR-003 — Template revisions

WHEN a facilitator modifies a template definition,
the system SHALL create a new immutable revision containing the full template content
(nodes, links, metadata) at the time of modification, and the template's revision
number SHALL increment.

### FR-003a — Revision immutability

WHILE a template revision exists,
the system SHALL retain its complete content unchanged and SHALL NOT allow it to be
modified in place.

### FR-003b — Referenced revisions are non-deletable

WHILE a template revision is referenced by any workflow or workshop,
the system SHALL reject deletion of that revision.

### FR-003c — Template deletion semantics

WHEN a facilitator deletes a template,
the system SHALL remove it from the template gallery and administration views, and
SHALL retain all existing revisions as immutable records; referenced revisions remain
resolvable for workflows and workshops created from them.

### FR-004 — Template gallery

WHEN a user opens the template gallery,
the system SHALL list available templates with name, description, and category, and
SHALL allow filtering by type (workflow / block).

### FR-005 — Template preview

WHEN a user selects a template in the gallery,
the system SHALL show a preview of the template's structure before use.

### FR-006 — Use template creates a copy

WHEN a user activates "Use template" for a workflow template,
the system SHALL create a new workflow in the user's workspace containing a copy of
the template graph, and SHALL open it in the editor.

### FR-007 — Templates are immutable to users

IF a user attempts to edit a template directly,
THEN the system SHALL not modify the template definition; all edits apply to the
user-owned copy.

### FR-008 — Reset restores the source revision

WHEN a user activates "Reset to template" on a workflow that was created from a
template,
the system SHALL replace the workflow's graph with a fresh copy of the template
revision the workflow was created from, after user confirmation.

### FR-009 — Block insertion

WHEN a user activates "Insert block" for a block template,
the system SHALL add the block's nodes and links into the current workflow without
removing existing content.

### FR-010 — Block insertion identity remapping

WHEN a block is inserted,
the system SHALL assign new unique node identifiers and remap the block's internal link
identifiers so they do not collide with existing graph content.

### FR-011 — Block insertion placement

WHEN a block is inserted,
the system SHALL place the block's nodes relative to the current viewport/cursor
position.

### FR-012 — Block insertion is one undoable operation

WHEN a block is inserted,
the system SHALL record the insertion as a single undoable editor operation and select
the newly inserted nodes.

### FR-013 — Insert palette

WHEN a user opens the insert palette in the editor,
the system SHALL offer tabs for Nodes, Blocks, and Templates, and searchable entries
with workshop-friendly categories and descriptions.

### FR-014 — Template administration restricted to facilitator

WHEN a user who is not a facilitator attempts to create, modify, publish, or unpublish
a template definition,
THEN the system SHALL reject the action.

### FR-015 — Facilitator template management

WHEN a facilitator creates, modifies, publishes, or unpublishes a template definition,
the system SHALL apply the change to the canonical template set.

### FR-016 — Published templates visible to all

WHILE a template is published,
the system SHALL offer it in the template gallery to all users.

### FR-017 — Unpublished templates hidden

WHILE a template is not published,
the system SHALL NOT offer it in the template gallery to non-facilitator users.

### FR-017a — Unpublish does not break referenced revisions

WHEN a facilitator unpublishes a template or a revision referenced by an existing
published workshop,
THEN the workshop SHALL remain functional and resolvable to its referenced revision;
unpublishing SHALL only hide the template from the gallery.

### FR-018 — Workflow records source revision

WHEN a workflow is created from a template,
the system SHALL record the source template id and the source template revision on
the workflow.

### FR-019 — Block external interfaces

WHEN a block template is defined,
the system SHALL support declared external inputs and outputs for the block.

### FR-020 — Connection suggestions on insertion

WHEN a block with declared external interfaces is inserted,
the system SHALL suggest connections between the block's external ports and
compatible existing nodes in the workflow.

### FR-021 — Canonical block library

The system SHALL ship a canonical block library containing at least: rubric scorer
(rubric → LLM → score), answer classifier (answer → classification), feedback
generator (context + score → feedback), validation/review (initial assessment →
second check), and optional consistency check (compare/validate generated result).

## Non-functional requirements

### NFR-001 — Insert latency

Block insertion SHALL complete within 500 ms for blocks of up to 20 nodes.

## Acceptance criteria

### AC-001 — Use template duplicates

Traces to: FR-006, FR-007, FR-018

```gherkin
Given a published workflow template
When the user activates "Use template"
Then a new workflow owned by the user's workspace is created from the template and opened in the editor
And the workflow records the source template id and revision
And the template definition itself is unchanged
```

### AC-002 — Reset restores source revision

Traces to: FR-008, FR-018

```gherkin
Given a workflow created from template revision R with modified content
When the facilitator later modifies the template so its revision becomes R+1
And the user activates "Reset to template" and confirms
Then the workflow graph matches a fresh copy of revision R, not R+1
```

### AC-003 — Reset requires confirmation

Traces to: FR-008

```gherkin
Given a workflow created from a template
When the user activates "Reset to template"
Then a confirmation is required before the graph is replaced
```

### AC-004 — Insert block preserves existing graph

Traces to: FR-009, FR-010

```gherkin
Given a workflow with existing nodes
When the user inserts a block template
Then the existing nodes and links remain intact
And the block's nodes have identifiers that do not collide with existing ones
```

### AC-005 — Insert block is undoable

Traces to: FR-012

```gherkin
Given a block was just inserted
When the user performs undo
Then the inserted nodes and links are removed and the graph returns to its prior state
```

### AC-006 — Inserted block is placed near viewport

Traces to: FR-011

```gherkin
Given the user has panned the canvas away from the origin
When the user inserts a block
Then the block's nodes appear within the visible viewport area
```

### AC-007 — Gallery shows metadata

Traces to: FR-004, FR-005

```gherkin
Given multiple templates of both types exist
When the user opens the template gallery
Then each template shows name, description, and category, and can be filtered by type
And selecting a template shows a structural preview
```

### AC-008 — Non-facilitator cannot modify templates

Traces to: FR-007, FR-014

```gherkin
Given a user who is not a facilitator
When the user attempts to modify or delete a template definition
Then the action is rejected
And the template definition is unchanged
```

### AC-009 — Facilitator publishes a template

Traces to: FR-015, FR-016

```gherkin
Given a facilitator has created a template in unpublished state
When the facilitator publishes the template
Then the template appears in the gallery for all users
```

### AC-010 — Unpublished template hidden from participants

Traces to: FR-017

```gherkin
Given a template is unpublished
When a non-facilitator user opens the template gallery
Then the template is not listed
And when the facilitator opens the gallery, the template is listed with its unpublished state
```

### AC-011 — Facilitator authenticates via admin session

Traces to: SPEC-0013/FR-001

```gherkin
Given the server has admin credentials configured via environment variables
When a user authenticates with those credentials
Then the user acts as facilitator and can manage template definitions
```

### AC-012 — Wrong credentials rejected

Traces to: SPEC-0013/FR-002

```gherkin
Given the server has admin credentials configured
When a user authenticates with incorrect credentials
Then no facilitator privileges are granted
And template administration actions are rejected
```

### AC-013 — Bundled templates seed the store

Traces to: FR-002

```gherkin
Given a fresh deployment with no persisted templates
When the server starts
Then the bundled templates exist in the persisted template store
And the facilitator can modify them, producing a new revision
```

### AC-014 — Modification creates a new immutable revision

Traces to: FR-003, FR-003a, FR-018

```gherkin
Given a template at revision R referenced by an existing workflow
When the facilitator modifies the template
Then the template's revision becomes R+1 with its full content stored as a new record
And revision R's content is retained unchanged
And the existing workflow still references revision R
```

### AC-014a — Referenced revision survives template modification and unpublish

Traces to: FR-003a, FR-003b, FR-017a

```gherkin
Given a published workshop bound to template revision R
When the facilitator modifies the template to revision R+1 and later unpublishes the template
Then reset on a workflow created from revision R still restores the exact content of revision R
And the workshop remains joinable and functional
And the facilitator cannot delete revision R while it is referenced
```

### AC-015 — Block insertion suggests connections

Traces to: FR-019, FR-020

```gherkin
Given a workflow with a student answer node
When the user inserts the rubric scorer block (external input: answer)
Then a connection between the student answer node and the block's answer input is suggested
```

### AC-016 — Canonical block library available

Traces to: FR-021

```gherkin
Given a fresh deployment
When a user opens the Blocks tab of the insert palette
Then rubric scorer, answer classifier, feedback generator, validation/review, and consistency check blocks are available
```

### AC-017 — Deleting a template retains referenced revisions

Traces to: FR-003c

```gherkin
Given a template with revision R referenced by an existing workflow
When the facilitator deletes the template
Then the template no longer appears in the gallery or administration views
And the workflow's reset action still restores the exact content of revision R
```

## Edge cases

- Inserting a block into an empty workflow → allowed; behaves like a partial start.
- Template graph references node types not registered in the current build → template
  is flagged unavailable rather than partially imported.
- Duplicate "Use template" clicks → each click creates a distinct workflow copy, no
  silent overwrite.
- Deleting a template that has never been referenced → all revisions may be purged;
  referenced revisions are always retained (FR-003b).

## Business rules

- A template SHALL never be edited in place; user actions always operate on
  workspace-owned copies.
- A workflow created from a template SHALL retain a reference to its source template id
  and revision (required for reset and reproducibility).
- Template authoring, modification, and publication SHALL be restricted to the
  facilitator (admin) role.

## Constraints

- Template graph content uses the same node/link model as stored workflows.
- Facilitator role is established via SPEC-0013 (env-configured admin credentials,
  server-issued session).

## Dependencies

- SPEC-0004 (workflows must be workspace-owned for copies and reset).
- SPEC-0013 (facilitator authentication for template administration).

## Assumptions

- Bundled templates serve as seed data for the persisted template store; the store is
  the single source of truth at runtime.

## Open questions

- None currently.

## Success criteria

- A participant can go from gallery → own editable WAIE workflow in under 30 seconds.
- A broken participant graph can be restored to the exact template revision it
  started from in one action.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Review revision: immutable template revisions (FR-003 reworded, FR-003a, AC-014) with referenced revisions non-deletable (FR-003b) and template deletion retaining history (FR-003c, AC-017); unpublish only hides from gallery and never breaks workshops pinned to a revision (FR-017a, AC-014a) |
| 2026-09-15 | Added facilitator (admin) role: template authoring/publication restricted to facilitator (FR-012..FR-015, AC-008..AC-010) |
| 2026-09-15 | Facilitator authentication decided: env-based admin username/password, supplyable via docker compose (FR-016..FR-017, AC-011..AC-012, constraint added) |
| 2026-09-15 | Resolved contradiction: templates are persisted server-side entities; bundled templates are seed data (FR-002, AC-013). Added revisions (FR-003, FR-018, AC-002, AC-014), block external interfaces + connection suggestions (FR-019/020, AC-015), canonical block library (FR-021, AC-016). Facilitator auth re-pointed to SPEC-0013. Renumbered FR-004..FR-021 and AC traces. |
