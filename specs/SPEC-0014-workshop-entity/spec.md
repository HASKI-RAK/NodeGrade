---
id: SPEC-0014
type: feature
title: Workshop entity and join flow
status: implemented
parent: SPEC-0001
priority: P0
created: 2026-09-15
updated: 2026-09-25
depends_on:
  - SPEC-0013
  - SPEC-0003
  - SPEC-0004
related:
  - SPEC-0002
  - SPEC-0007
  - SPEC-0022
---

# Workshop entity and join flow

## Intent

### Problem

Workshop codes were specified as identifying "exactly one workshop", but no Workshop
entity was ever defined — the relationship between a code, the WAIE template, and
participant workspaces was implicit. It was also unresolved what happens when a
returning user already possesses a browser workspace.

### Desired outcome

A first-class Workshop entity (title, code, status, template revision, expiry) owned
by the facilitator. Joining via `/workshop/:code` resolves the published workshop,
establishes a participant workspace explicitly associated with that workshop, and
duplicates the workshop's template revision into it.

## Scope

### In scope

- Workshop entity: id, title, code, status (DRAFT | PUBLISHED | CLOSED), template
  reference (template id + revision), optional expiry, timestamps.
- Facilitator management of workshops and their codes (create, publish, close).
- Join flow: resolve code → published workshop → participant workspace associated
  with the workshop → duplicate the workshop's template revision → open workflow.
- Distinct participant workspace per workshop join (a returning user with an existing
  browser workspace still gets a workshop-specific workspace).

### Out of scope

- Multiple concurrent templates per workshop — superseded: SPEC-0022/FR-001 brings them
  into scope as a workshop's template entries.
- Participant-facing workshop analytics or progress dashboards.
- Workshop scheduling or calendar integration.

## Actors

- Facilitator (admin): creates, publishes, closes workshops; owns the code.
- Participant (anonymous): joins via code, receives a workshop-associated workspace
  with a duplicated template workflow.

## User scenarios

### US-001 — Facilitator prepares a workshop

As a facilitator,
I want to create a workshop bound to a specific template revision and publish its
code,
so that participants joining the code all start from the same defined starting point.

Priority: P1

Independent value: makes the workshop reproducible and shareable without verbal setup.

### US-002 — Participant joins via code

As a participant,
I want to open the workshop link and land in my own copy of the workshop workflow,
so that I can start the exercise immediately.

Priority: P1

Independent value: one-step entry; no navigation or account needed.

### US-003 — Returning user joins a workshop

Superseded by SPEC-0022/FR-013: personal browser workspaces no longer exist, so a
workshop workspace is the only participant workspace there is to keep apart. A returning
participant of the same workshop is covered by FR-009.

## Functional requirements

### FR-001 — Workshop entity

Superseded by SPEC-0022/FR-001: a workshop consists of a unique id, title, unique code,
status (DRAFT | PUBLISHED | CLOSED), one or more ordered template entries (each pinning a
revision or following the newest one), an optional expiry timestamp, and creation/update
timestamps; the single template reference is gone.

### FR-002 — Code identifies one workshop

WHEN a workshop code is resolved,
the system SHALL map it to exactly one workshop.

Verification: unique constraint on the workshop code plus a test asserting that
resolving a code returns exactly one workshop or none.

### FR-003 — Join resolves published workshop

WHEN a participant opens the workshop deep link containing a code,
the system SHALL resolve the workshop and SHALL only proceed if its status is
PUBLISHED and it has not expired.

### FR-004 — Join establishes workshop workspace

WHEN a participant joins a workshop,
the system SHALL establish a participant workspace of type WORKSHOP explicitly
associated with that workshop.

### FR-005 — Join duplicates the workshop's template revision

Superseded by SPEC-0022/FR-007 and FR-008: a join copies and opens an entry only when the
workshop has exactly one available entry; otherwise the participant lands on the workshop
overview and starts entries from there (SPEC-0022/FR-009).

### FR-006 — Workshop management restricted to facilitator

WHEN a user who is not a facilitator attempts to create, publish, or close a workshop,
THEN the system SHALL reject the action.

### FR-007 — Code validity lifecycle

WHILE a workshop is PUBLISHED and not expired,
its code SHALL be accepted for joining.

### FR-008 — Closed or expired workshop rejected

IF a workshop is CLOSED or its expiry has passed,
THEN the system SHALL reject its code on subsequent join attempts with a
"workshop unavailable" state.

### FR-009 — Re-join returns to existing work

Superseded by SPEC-0022/FR-006 and FR-009: a re-join from the same browser returns the
existing workshop workspace whether or not it holds workflows, and starting an entry
again opens the existing copy rather than creating a duplicate.

## Non-functional requirements

### NFR-001 — Join latency

Joining a workshop SHALL complete within 3 seconds under normal load (50 concurrent
participants).

Verification: load test with 50 concurrent joins; 95% complete within 3 seconds.

## Acceptance criteria

### AC-001 — Facilitator publishes workshop

Traces to: FR-001, FR-006

```gherkin
Given a facilitator has created a workshop in DRAFT state with at least one template entry
When the facilitator publishes the workshop
Then the workshop's code becomes valid for joining
```

### AC-002 — Non-facilitator cannot manage workshops

Traces to: FR-006

```gherkin
Given a user who is not a facilitator
When the user attempts to create or publish a workshop
Then the action is rejected
```

### AC-003 — Join creates workshop workspace and workflow copy

Traces to: FR-003, FR-004, FR-005

Amended by SPEC-0022/AC-005: the copy is made on join only for a single-entry workshop.

```gherkin
Given a PUBLISHED workshop whose only entry pins template revision R
When a participant joins via the workshop code
Then a WORKSHOP-type workspace associated with that workshop is established
And a workflow containing a copy of revision R is created in it and opened in the editor
```

### AC-004 — Returning user gets separate workshop workspace

Traces to: FR-004, FR-009

Superseded by SPEC-0022/AC-010: a browser holds no personal workspace any more, so there
is nothing for a workshop workspace to be kept apart from.

### AC-005 — Re-join does not duplicate

Traces to: FR-009

Amended by SPEC-0022/AC-007: the workspace is returned on re-join, and starting an entry
again opens the existing copy.

```gherkin
Given a participant has already joined a workshop and started one of its entries
When the participant joins again from the same browser and opens that entry
Then the same workshop workspace and workflow are returned
And no duplicate workflow is created
```

### AC-006 — Closed workshop rejected

Traces to: FR-008

```gherkin
Given a workshop that the facilitator has closed
When a participant opens the deep link containing its code
Then a "workshop unavailable" state is shown
```

### AC-007 — Draft workshop code not joinable

Traces to: FR-003, FR-007

```gherkin
Given a workshop in DRAFT state
When a participant opens the deep link containing its code
Then a "workshop unavailable" state is shown
```

## Edge cases

- Two workshops share the same template → each workshop references it independently;
  closing one does not affect the other.
- Workshop template is unpublished or deleted after publication → a pinned entry keeps
  working; an entry that follows the newest revision is shown unavailable
  (SPEC-0022/FR-002, FR-003).
- Expiry passes mid-session → new joins are rejected and already-joined participants
  keep read access only (SPEC-0022/FR-011, FR-012).

## Business rules

- Superseded by SPEC-0022/FR-001 and FR-005: a workshop has at least one template entry
  and at most one entry per template (formerly exactly one template revision).
- A workshop code SHALL identify exactly one workshop and SHALL be shareable with
  participants (e.g. printed in the tutorial handout).
- Participant workshop workspaces SHALL be associated with exactly one workshop.

## Constraints

- Workshop management requires the facilitator role (SPEC-0013).

## Dependencies

- SPEC-0013 (facilitator authentication for workshop management).
- SPEC-0003 (templates and revisions to reference).
- SPEC-0004 (workspace model the participant workspace builds on).

## Assumptions

- A single canonical workshop (WAIE) is needed for the conference; multiple concurrent
  workshop definitions are supported by the model but not required.

## Open questions

- None currently.

## Success criteria

- A facilitator can publish a workshop bound to a template revision, and every
  participant joining the code lands in their own copy of exactly that revision in
  one step.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created; introduces the previously implicit Workshop as a first-class entity |
| 2026-09-15 | Review revision: "revoke" removed as a separate concept — closing the workshop invalidates its code (FR-006/FR-008 cover all code invalidation); unpublish/deletion of a referenced template revision never breaks a published workshop per SPEC-0003/FR-017a and FR-003b |
| 2026-09-25 | SPEC-0022 supersedes FR-001, FR-005, FR-009, US-003, AC-004, the one-revision business rule and the single-template out-of-scope item (workshops hold several pinned or newest-revision entries; no browser workspaces); amends AC-001, AC-003, AC-005, FR-004 and the unpublish and expiry edge cases |
