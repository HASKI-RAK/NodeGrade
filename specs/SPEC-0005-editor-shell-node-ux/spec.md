---
id: SPEC-0005
type: feature
title: Editor shell and node UX
status: implemented
parent: SPEC-0001
priority: P0
created: 2026-09-15
updated: 2026-09-25
depends_on:
  - SPEC-0003
  - SPEC-0004
related:
  - SPEC-0006
---

# Editor shell and node UX

## Intent

### Problem

The editor's AppBar mixes developer actions (reconnect, upload, download, save,
publish, preview, graph selection) as primary controls, node discovery relies on
LiteGraph's raw right-click menus, and nodes like the LLM node expose all advanced
parameters (temperature, top-p, top-k, penalties, token limits) directly on the canvas.
Additionally, the resize handler sets canvas height to `window.outerWidth`, breaking
layout after window resize.

### Desired outcome

A task-oriented editor shell: a simple toolbar (Add, Templates, Run, Preview, save
status), a searchable left-side component palette, and a right-side inspector
panel for editing node properties — with advanced settings hidden by default and the
canvas sized correctly to its container.

## Scope

### In scope

- Toolbar redesign with task-oriented primary actions and an overflow menu for advanced
  actions (save as, import, export, connection info, developer tools).
- Removal of the WebSocket reconnect button as a primary user action and of the
  reconnect redirect behavior.
- Left-side searchable component palette with workshop-friendly categories
  (Essential, AI, Assessment, Validation, Blocks).
- Inspector panel for editing the selected node's properties, including large text
  editing for prompts.
- Node property metadata model: each node definition declares its properties (key,
  label, control type, advanced flag, required flag, validation) and its compact
  "key value" — consumed by palette, inspector, and compact nodes.
- Editor-wide undo/redo for graph mutations.
- Autosave with visible save state (Saving… / Saved / Save failed — Retry) occupying
  the former Save button position; no explicit Save action (Save as… remains in the
  overflow menu).
- Conflict indication when a save is rejected by optimistic concurrency (stale
  version, see SPEC-0004/FR-013).
- Canvas sizing driven by its container element instead of window dimensions.

### Out of scope

- Canvas rendering engine replacement.
- Run/trace panel content (SPEC-0006).
- Template gallery content (SPEC-0003).

## Actors

- Participant (anonymous): needs simple, discoverable editing.
- Expert user: needs access to advanced settings and developer tools.

## User scenarios

### US-001 — Find and add a component

As a participant,
I want to search a categorized palette and add a component by clicking it,
so that I do not need to know LiteGraph's right-click menus or internal node names.

Priority: P1

Independent value: makes the node inventory approachable for non-developers.

### US-002 — Edit a prompt comfortably

As a participant,
I want to edit a rubric prompt in a large text editor in an inspector panel,
so that I can write multi-line prompts without fighting canvas widgets.

Priority: P1

Independent value: the core workshop activity is editing prompts and rubrics.

### US-003 — Hide advanced complexity

As a participant,
I want the canvas node to show only essential information,
so that the workflow structure is readable at a glance.

Priority: P2

Independent value: keeps focus on assessment strategy, not LLM tuning knobs.

## Functional requirements

### FR-001 — Toolbar primary actions

WHEN the editor is open,
the system SHALL present primary toolbar elements for: Add, Templates, Run, Preview,
and the save status indicator. The toolbar SHALL NOT present an explicit Save button.

### FR-002 — Advanced actions menu

WHEN the user opens the toolbar overflow menu,
the system SHALL offer: Save as, Import workflow, Export workflow, Connection
information, and Developer tools.

### FR-003 — No reconnect as primary action

The editor toolbar SHALL NOT expose WebSocket reconnection as a primary user action,
and SHALL NOT navigate the user to a different route as part of a reconnect action.

### FR-004 — Component palette

WHEN the user opens the component palette,
the system SHALL show a searchable list of available nodes grouped into
workshop-friendly categories, and adding an entry SHALL place the node on the canvas.

### FR-005 — Palette includes blocks

WHERE block templates exist,
the component palette SHALL include a Blocks section listing them (see SPEC-0003).

Verification: palette test with block templates present asserting that a Blocks section
lists them.

### FR-006 — Inspector panel

WHEN a node is selected,
the system SHALL show an inspector panel with the node's editable properties.

WHILE a property is declared with a `chipMap` control,
the inspector SHALL edit its `KEY=value, …` text as chips: one group per allowed value
holding the keys mapped to it, each removable, and a field per group that adds a key on
Enter, writing the same text form back to the property.

WHILE a node definition or a property definition carries help text,
the inspector SHALL show a "?" beside the node title or the control that opens a dialog
with that text.

### FR-007 — Advanced settings hidden by default

WHILE a node has advanced properties,
the system SHALL hide them behind an explicit "Advanced settings" disclosure in the
inspector.

### FR-008 — Prompt editing in inspector

WHEN a prompt-type node is selected,
the inspector SHALL provide a multi-line text editor for its prompt content.

### FR-009 — Compact canvas nodes

WHILE a node has advanced properties,
the canvas node SHALL display only its essential identity (name, key value, ports) and
not the advanced properties.

### FR-010 — Container-based canvas sizing

WHEN the editor container is resized,
the canvas SHALL resize to match the container's dimensions.

### FR-011 — Node property metadata model

The system SHALL provide a node property metadata model in which each node definition
declares: category, description, its properties (key, label, control type, advanced
flag, required flag, validation), and which property serves as the compact node's key
value. The palette, inspector, and compact canvas nodes SHALL be driven by this
metadata rather than per-node-type UI code.

### FR-012 — Undo/redo for graph mutations

WHEN a graph mutation is performed (node add/remove/link, property change, block
insertion),
the system SHALL record it in an editor command history, and the user SHALL be able
to undo and redo mutations via standard keyboard shortcuts (Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z).

### FR-013 — Autosave

WHEN the workflow has unsaved changes,
the system SHALL automatically persist them after a short debounce period without
requiring an explicit save action.

### FR-013a — Save conflict indication

IF a save is rejected by the backend with a version conflict (SPEC-0004/FR-013),
THEN the save status SHALL indicate the conflict and the system SHALL offer the user
a resolution action (e.g. reload the newer state) instead of silently overwriting
newer stored state.

### FR-014 — Save state display

WHILE autosave is in progress, has succeeded, or has failed,
the toolbar SHALL display the corresponding state: Saving…, Saved, or Save failed —
Retry.

### FR-015 — Failed autosave recovery

IF autosave fails,
THEN the system SHALL offer a retry action and SHALL warn the user before leaving the
editor with unsaved changes.

## Non-functional requirements

### NFR-001 — Palette search responsiveness

Palette search SHALL filter results within 200 ms of input for the full node inventory.

Verification: timed palette search over the full node inventory; results are filtered
within 200 ms of input.

## Acceptance criteria

### AC-001 — Toolbar shows task actions

Traces to: FR-001, FR-002

```gherkin
Given the editor is open
When the user views the toolbar
Then Add, Templates, Run, Preview, and the save status are visible as primary elements
And no explicit Save button is present
And the overflow menu contains Save as, Import, Export, Connection information, and Developer tools
```

### AC-002 — Reconnect removed

Traces to: FR-003

```gherkin
Given the editor is open
When the user inspects the toolbar
Then no primary reconnect action is present
And no toolbar action navigates the user away from the editor as a side effect
```

### AC-003 — Palette search and add

Traces to: FR-004

```gherkin
Given the component palette is open
When the user searches for "language model" and activates the result
Then a language model node is added to the canvas
```

### AC-004 — Inspector edits node properties

Traces to: FR-006, FR-008

```gherkin
Given a prompt node is selected
When the user edits the prompt text in the inspector
Then the node's prompt content reflects the edit
```

### AC-005 — Advanced settings collapsed

Traces to: FR-007, FR-009

```gherkin
Given an LLM node is selected
When the user views the inspector
Then advanced properties are hidden until "Advanced settings" is expanded
And the canvas node does not display advanced properties
```

### AC-006 — Canvas resizes with container

Traces to: FR-010

```gherkin
Given the editor is open
When the browser window is resized
Then the canvas fills the editor container without layout distortion
```

### AC-007 — Inspector driven by property metadata

Traces to: FR-011, FR-006

```gherkin
Given a node definition declares properties with labels, control types, and an advanced flag
When the node is selected
Then the inspector renders each property with its declared control and label
And advanced properties are grouped behind the Advanced settings disclosure
```

### AC-008 — Undo/redo across mutation types

Traces to: FR-012

```gherkin
Given the user has added a node, linked it, and changed a property
When the user performs undo three times
Then each mutation is reverted in reverse order
And performing redo restores them in the original order
```

### AC-009 — Changes persist without explicit save

Traces to: FR-013

```gherkin
Given the user has modified the rubric prompt
When the user waits for the autosave debounce period and reloads the page
Then the modification is present without having pressed Save
```

### AC-010 — Save state visible

Traces to: FR-014

```gherkin
Given the user has made a change
When autosave runs
Then the toolbar shows Saving… followed by Saved
```

### AC-011 — Failed autosave warns before navigation

Traces to: FR-015

```gherkin
Given autosave has failed
When the user attempts to leave the editor
Then a warning about unsaved changes is shown with a retry option
```

### AC-012 — Stale save shows conflict

Traces to: FR-013a, SPEC-0004/FR-013

```gherkin
Given the same workflow open in two tabs and one tab has saved a newer version
When the other tab's autosave attempts to save a stale version
Then the save status indicates a conflict
And a resolution action is offered
And the newer stored state is not silently overwritten
```

## Edge cases

- Selection of multiple nodes → inspector shows a multi-selection state or nothing;
  must not show one node's properties as if they applied to all.
- Palette entry for a node type unavailable in the current build → entry hidden or
  disabled with a reason.

## Business rules

- None beyond the FRs.

## Constraints

- The canvas remains LiteGraph-based; the shell is additive around it.

## Dependencies

- SPEC-0003 (Blocks section of the palette).
- SPEC-0004 (toolbar Save operates on workspace-scoped workflows).

## Assumptions

- Existing node types can be categorized into the proposed palette groups without
  functional changes.

## Open questions

- Should the inspector be a fixed right panel or a resizable split view?

## Success criteria

- A participant can add, configure, and connect a component without any knowledge of
  LiteGraph internals.
- No layout distortion after window resize.

## Change history

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-16 | Implemented editor shell, palette and blocks, property inspector, graph history, autosave recovery, responsive canvas sizing, Preview-based Run, student read-only mode, and LTI instructor publishing in overflow.                                                                                                                                                                                                                      |
| 2026-09-15 | Initial specification created                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-09-15 | Added node property metadata model (FR-011, AC-007), editor-wide undo/redo (FR-012, AC-008), autosave with save-state display and failure recovery (FR-013..FR-015, AC-009..AC-011) — closes the persistence gap with SPEC-0008's reload-persistence smoke test                                                                                                                                                                          |
| 2026-09-15 | Review revision 2: explicit Save removed from the toolbar — save status (Saving…/Saved/Save failed) occupies that position, Save as… remains in overflow (FR-001/FR-002, AC-001); Publish removed (its old editor → student URL semantics are undefined in the new domain; no current spec requires publishing a normal workflow); save conflict from optimistic concurrency surfaced via status and resolution action (FR-013a, AC-012) |
| 2026-09-25 | FR-006 extended: `chipMap` property control (KEY=value text edited as grouped chips) and "?" help dialogs for nodes and properties in the inspector. |
