---
id: SPEC-0021
type: feature
title: Workflow version history
status: implemented
parent: SPEC-0001
priority: P2
created: 2026-09-22
updated: 2026-09-22
depends_on:
  - SPEC-0004
  - SPEC-0005
related:
  - SPEC-0003
  - SPEC-0007
---

# Workflow version history

## Intent

### Problem

The editor saves by itself. Ninety seconds after a participant deletes the wrong node,
reworks three prompts and discovers the graph no longer runs, the damage is the stored
state: the autosave has written it, `Ctrl+Z` history lives in the tab that may since have
been reloaded, and the optimistic version counter only ever counts forward. The two
escapes that exist both throw away more than the mistake — "Reset to source template"
discards every edit since the copy was made, and "Save as" preserves the broken graph
under a new name rather than recovering the working one.

Participants therefore edit defensively, or lose work. In a 35-minute workshop, losing
twenty minutes of prompt tuning is losing the session.

### Desired outcome

The server keeps the states the workflow leaves behind. A participant opens Version
history, sees the last handful of checkpoints with when each was taken and how large the
graph was, and puts one back with two clicks — and the graph that was live when they did
so is itself kept, so a restore can be undone. Entries they do not want are deletable,
one at a time or all at once.

## Scope

### In scope

- A stored past state of a workflow: its content, name, version counter, content schema
  and the reason it was kept.
- Capture on an ordinary save, coalesced so a stream of autosaves produces checkpoints
  rather than a row per keystroke.
- Unconditional capture before the two operations that discard a graph wholesale: reset
  to template, and restore itself.
- Workspace-scoped REST to list, read, restore and delete stored states.
- A Version history dialog in the editor, with per-entry confirmation.
- Retention: a per-workflow cap, and deletion with the workflow and the workspace.

### Out of scope

- Comparing two versions, or a diff of any kind.
- Naming or pinning a state by hand ("keep this one forever").
- History for template revisions, which are immutable already (ADR-0003).
- History of the published projection: publishing snapshots content by design
  (SPEC-0004), and republishing is one click.
- Restoring a version into a *different* workflow; "Save as" already copies a graph.
- Showing a learner the instructor's drafts.

## Actors

- Participant: edits a workflow copy in a workshop, makes a mistake, wants the graph from
  before it.
- Facilitator: demonstrates that experimenting is safe, because the previous state is one
  dialog away.
- LTI instructor: edits the course workflow over weeks and needs the same recovery.
- LTI learner: runs the published workflow; never sees or restores a draft.

## User scenarios

### US-001 — Undo an edit the tab no longer remembers

As a participant, I want to load the graph as it was before this stretch of editing, so
that a wrong turn costs minutes rather than the session.

Priority: P1
Independent value: recovery survives a reload, a crash and a closed tab, which in-editor
undo does not.

### US-002 — Undo the undo

As a participant, I want the graph I restored *from* to still be available, so that
restoring the wrong entry is not itself a loss.

Priority: P1
Independent value: makes the feature safe to try, which is what makes it used.

### US-003 — Take out what should not be kept

As a participant, I want to delete stored states, so that a graph I do not want lying
around in my workspace does not stay there.

Priority: P2
Independent value: the history is the participant's, including the right to empty it.

## Functional requirements

### FR-001 — Capture what a save replaces

WHEN a save changes a workflow's content, the system SHALL store the content, name,
version counter and content schema the workflow held immediately before the save, unless
a state was already stored for that workflow less than the capture window ago. The window
SHALL be configurable and SHALL default to two minutes. A save that only changes the name
SHALL NOT store a state, and a save rejected as stale SHALL NOT store one.

### FR-002 — Capture before a graph is discarded

WHEN a workflow is reset to its source template, or restored to a stored state, the
system SHALL store the live state first, regardless of the capture window, recording the
reason as `reset` or `restore` respectively.

### FR-003 — Restore a stored state

The system SHALL expose an action that writes a stored state's content and content schema
back to the workflow and increments its version counter. It SHALL require no `If-Match`,
SHALL leave the stored state in the history, and SHALL answer with the workflow as it is
afterwards, content included. WHEN the editor restores, it SHALL first save what it holds,
then load the returned content, discarding its local undo history.

### FR-004 — Delete stored states

The system SHALL expose deleting one stored state by id, and deleting every stored state
of one workflow. Neither SHALL change the workflow itself.

### FR-005 — Retention

The system SHALL keep at most the newest N stored states per workflow, N being
configurable with a default of 20, trimming after each capture. Stored states SHALL be
deleted with their workflow, and therefore with their workspace.

### FR-006 — Reading the history

The system SHALL expose, under the workflow's REST path behind the workspace bearer
token, the stored states newest first, each carrying its id, version counter, name,
capture reason, node count and capture time but not its content, and separately the
content of one stored state. Every query SHALL be scoped to the calling workspace; a
workflow or stored state outside it SHALL answer not found.

### FR-007 — Learners have no history

WHEN the caller is an LTI launch under the published projection, every version-history
endpoint SHALL refuse the request, and the editor SHALL NOT offer the action.

### FR-008 — The Version history dialog

The editor SHALL offer "Version history…" in its overflow menu, opening a dialog that
lists the stored states with their time, node count and reason, and offers Restore and
Delete per entry plus Clear history for all of them. Each of those three actions SHALL
require a second, explicit confirmation that states what will happen. A failed read SHALL
be reported with a retry, and a failed action SHALL leave the dialog open with the reason.

## Non-functional requirements

### NFR-001 — History never fails the edit it protects

A failure to store or trim a state SHALL be logged and SHALL NOT fail the save, reset or
restore that triggered it.

### NFR-002 — Bounded cost per save

An autosave that is inside the capture window SHALL NOT read or write workflow content
beyond the save itself.

## Acceptance criteria

### AC-001 — A save is captured once per window

Traces to: FR-001, NFR-002

```gherkin
Given a workflow whose last stored state is ten minutes old
When a save changes its content from A to B
Then a stored state holds content A at the version the workflow had before the save
And when a further save changes B to C within the window
Then no further state is stored and the save reads no content beyond its own write
And given instead the save only changes the name
Then no state is stored
And given instead the save is rejected as stale
Then no state is stored
```

### AC-002 — Discarding a graph always leaves a copy

Traces to: FR-002

```gherkin
Given a workflow saved seconds ago, so the capture window has not passed
When it is reset to its source template
Then the graph as it was before the reset is stored with reason "reset"
And when a stored state is then restored
Then the graph as it was before the restore is stored with reason "restore"
```

### AC-003 — Restoring puts the old graph back, reversibly

Traces to: FR-003

```gherkin
Given a workflow at version 9 and a stored state captured at version 2
When the participant restores that state
Then the workflow holds the stored content at version 10
And the response carries that content and the new entity tag
And the history still lists the state that was restored, plus the version-9 graph
And the editor shows the restored graph with an empty undo history
```

### AC-004 — Deleting is scoped and confirmed

Traces to: FR-004, FR-006

```gherkin
Given a workspace with a workflow that has stored states
When it deletes one by id
Then that state is gone and the workflow's content is unchanged
And when it clears the history
Then no stored states remain and the workflow's content is unchanged
And when it asks to delete a state belonging to another workspace's workflow
Then the answer is not found
```

### AC-005 — The history stays bounded and goes with its workflow

Traces to: FR-005

```gherkin
Given a workflow holding the maximum number of stored states
When another state is captured
Then the oldest is gone and the count is unchanged
And when the workflow is deleted
Then none of its stored states remain
```

### AC-006 — The list reads without loading graphs

Traces to: FR-006, FR-008

```gherkin
Given a workflow with a state captured before an edit and one captured before a reset
When the participant opens Version history
Then both are listed newest first with their version, time, node count and reason
And no graph content is fetched to render the list
And given instead the workflow has no stored states
Then the dialog explains when the first one will be kept
```

### AC-007 — A learner is refused

Traces to: FR-007

```gherkin
Given an LTI launch under the published projection
When it requests, restores or deletes a version of the launched workflow
Then each request is refused as editor-only
And the learner's editor offers no version history
```

### AC-008 — A failed capture is invisible to the participant

Traces to: NFR-001

```gherkin
Given a workflow save that would capture a state
When the capture fails
Then the save still succeeds and reports its new version
```

## Edge cases

- A workflow edited in two tabs: the capture belongs to whichever save lands, and the
  losing tab still gets its version conflict. The captured content is a state the
  workflow genuinely held.
- Restoring while another tab holds an older entity tag: that tab's next save conflicts,
  which is the existing reload-or-copy path rather than a silent overwrite of the restore.
- A stored state captured before a content-schema change: its schema stamp is carried
  through the restore, so the boot-time content migration converts the workflow the same
  way it converts one that was never touched.
- Unparseable stored content: kept anyway, listed with a node count of zero.
- A restore of a state whose content is identical to the live graph: still captures and
  still increments the version, because the user asked for an action, not for a diff.
- Deleting the state one has just restored from: allowed; the live workflow already holds
  that content.
- The very first edit to a fresh workflow: captured, because no state exists yet.

## Business rules

- A stored state is always a state the workflow has left. The live row is the present.
- Only the workspace that owns the workflow may read, restore or delete its history.
- History is a convenience, never a guarantee: the cap and the capture window both mean
  states are dropped, and nothing in the product promises a particular one will be there.
- A restore is an edit like any other: it counts forward, it does not rewind the version
  counter.

## Constraints

- Workspace authorisation comes from the bearer token only; no handler reads a workspace
  id from the request (ADR-0001, SPEC-0004).
- Saves keep their `If-Match` semantics unchanged (ADR-0002): the capture is read before
  the conditional write and stored only if that write landed.
- Template revisions are out of this: they are immutable and already versioned (ADR-0003).
- The capture reason is stored as a code; its wording lives in the frontend.

## Dependencies

- SPEC-0004 (workspace isolation: the history hangs off the workflow and is scoped by the
  resolved workspace, and retention cascades through it).
- SPEC-0005 (editor shell: the dialog is reached from the editor's overflow menu and
  hands the restored content to the same load path as reset).

## Assumptions

- Twenty states per workflow covers a workshop session and a course-length edit history
  alike; beyond that, the oldest are the least wanted.
- Two minutes is short enough that a mistake is recoverable and long enough that a
  session of continuous editing does not evict everything older.
- Participants understand "version" as "an earlier state", not as a release.

## Open questions

- Should a participant be able to pin or name a state, so a known-good graph survives the
  cap? Deferred: the cap is generous relative to a workshop, and a pin needs its own
  eviction story.
- Should the history be readable while a workflow is open in two tabs, with entries
  attributed? Deferred; workspaces are single-participant in practice.

## Success criteria

- A participant who deletes a node, saves, and then wants it back recovers the graph
  without retyping anything.
- A restore performed by mistake is undone from the same dialog.
- A workshop's database does not grow with autosaves: the row count per workflow is
  bounded by the cap, not by how long the participant edited.

## Change history

| Date       | Change                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-22 | Initial specification, implemented in the same change: `WorkflowVersion` model and migration, `workflow-history.service.ts`, `workflow-history.controller.ts`, `WorkflowHistoryDialog`. |
