---
id: SPEC-0022
type: feature
title: Workshop template sets and workshop-scoped participant access
status: implemented
parent: SPEC-0001
priority: P1
created: 2026-09-25
updated: 2026-09-25
depends_on:
  - SPEC-0003
  - SPEC-0004
  - SPEC-0013
  - SPEC-0014
related:
  - SPEC-0002
  - SPEC-0006
  - SPEC-0007
  - SPEC-0020
---

# Workshop template sets and workshop-scoped participant access

## Intent

### Problem

Joining a workshop gave a participant almost nothing that opening a template from the
gallery did not. Anyone could mint an anonymous browser workspace, read every published
workflow template — grading logic and reference answers included — and run graphs against
the deployment's provider credentials, rate-limited only per address. A workshop, in turn,
could hand out exactly one pinned template revision, so a session with several exercises
needed several codes, and a facilitator could not let a workshop follow the template they
were still refining.

Closing a workshop only stopped new joins: participants already inside kept editing and
running graphs indefinitely.

### Desired outcome

A workshop is the participant's way in. A facilitator composes a workshop from several
workflow templates, each either pinned to one revision or following the template's
newest revision. A participant enters the code, lands on the workshop's overview with its
templates and their own workflows — or, when the workshop offers a single template,
directly in its copy — and sees nothing of NodeGrade's templates beyond what the workshop
offers. There is no anonymous workspace outside a workshop. Once the facilitator closes
the workshop or it expires, its participants can still read their work but can no longer
change or run it.

## Scope

### In scope

- Workshop template entries: ordered, one per template, pinned revision or newest revision.
- Facilitator management of entries at creation and afterwards.
- Participant workshop overview, auto-start of a single-entry workshop, idempotent start.
- Read-only enforcement for closed and expired workshops over HTTP and at run time.
- Removal of anonymous browser workspaces and of anonymous template access.
- Per-entry workshop readiness.
- Rate limiting of workspace creation through the join.

### Out of scope

- Facilitator visibility of participant runs or submissions.
- Pushing template changes into copies participants already made.
- Participant accounts or cross-device identity.
- Workshop start times or capacity limits.

## Actors

- Facilitator: composes, publishes and closes workshops and edits their entries.
- Participant (anonymous): joins by code and works only inside the workshop workspace.
- LTI learner or instructor: unchanged, enters through LTI (SPEC-0004/FR-001).

## User scenarios

### US-001 — Facilitator composes a multi-exercise workshop

As a facilitator,
I want one workshop code to offer several exercise templates, some frozen and some
following my latest edits,
so that a session with several exercises needs one handout and I can still fix a template
during the session.

Priority: P1

Independent value: one code per session instead of one per exercise.

### US-002 — Participant picks an exercise

As a participant,
I want to see the workshop's exercises after entering the code and continue the one I
already started,
so that I can move between exercises without losing work.

Priority: P1

Independent value: a workshop with several exercises is usable at all.

### US-003 — Templates stay inside the workshop

As an operator,
I want workflow templates and graph execution to be reachable only by workshop participants,
so that neither the grading content nor the provider budget is open to anyone who finds the
URL.

Priority: P1

Independent value: closes an anonymous path to paid model calls and reference answers.

### US-004 — A closed workshop stops

As a facilitator,
I want closing a workshop to stop its participants from editing and running,
so that the end of a session is the end of its cost and its submissions.

Priority: P2

Independent value: closing means what facilitators assume it means.

## Functional requirements

### FR-001 — Workshop template entries

The system SHALL let a workshop reference one or more workflow templates as ordered
entries, at most one entry per template, where each entry either pins one revision of its
template or follows the template's newest revision.

### FR-002 — Pinned entries survive template visibility changes

WHEN a participant starts a pinned entry,
the system SHALL copy the pinned revision even if its template has since been unpublished
or deleted.

### FR-003 — Newest-revision entries resolve at start

WHEN a participant starts an entry that follows the newest revision,
the system SHALL copy the template's current revision at that moment, and SHALL treat the
entry as unavailable while the template is unpublished or deleted.

### FR-004 — Copies are never rewritten

WHEN a template receives a new revision,
the system SHALL leave workflows already copied from it unchanged, and resetting such a
workflow SHALL restore the revision it was copied from.

Verification: unit test on `WorkflowService.reset` resetting to the recorded
`sourceTemplateRevisionId` after a newer revision exists.

### FR-005 — Facilitator manages entries

WHEN a facilitator creates a workshop or replaces the entries of a DRAFT or PUBLISHED
workshop,
the system SHALL require at least one entry, SHALL accept only workflow templates that are
not deleted, SHALL reject a pinned revision that belongs to another template, and SHALL
reject entry changes to a CLOSED workshop.

### FR-006 — Join establishes the workspace

WHEN a participant joins a published, unexpired workshop,
the system SHALL establish the participant's workshop workspace, and on a re-join from the
same browser SHALL return that workspace whether or not it holds workflows.

### FR-007 — A single-entry workshop opens directly

WHEN a participant joins a workshop with exactly one available entry and their workspace
holds no workflow,
the system SHALL start that entry and open its copy in the editor.

### FR-008 — Workshop overview

WHEN a participant of a workshop with several entries joins, or returns to the workshop,
the system SHALL show the workshop's entries in order, marking unavailable ones, and the
participant's own workflows.

### FR-009 — Starting is idempotent

WHEN a participant starts an entry they already have a copy of,
the system SHALL open the existing copy — the oldest workflow in their workspace copied
from that entry's template — instead of creating another.

### FR-010 — Entries are scoped to the participant's workshop

IF a participant requests an entry that does not belong to their workspace's workshop,
THEN the system SHALL answer as if the entry did not exist.

### FR-011 — Closed workshops are read-only over HTTP

WHILE a workshop is CLOSED or past its expiry,
the system SHALL reject every state-changing request made with one of its participant
workspace credentials with the code `workshop_closed`, and SHALL continue to serve reads.

### FR-012 — Closed workshops do not run

WHEN a run is requested with a participant workspace of a CLOSED or expired workshop,
the system SHALL refuse the run with the code `workshop_closed`, evaluated at each run
request rather than when the socket connected.

### FR-013 — No anonymous workspaces

The system SHALL NOT create a participant workspace other than by a workshop join or an
LTI launch, and SHALL reject browser workspace credentials.

### FR-014 — Templates are reached through the workshop

The system SHALL require a workspace credential to list or read templates, SHALL serve only
block templates through those endpoints, and SHALL make workflow templates available to
participants only as entries of their workshop.

### FR-015 — Join creation is rate limited

WHEN joins from one network address create more workspaces within the configured window
than the configured maximum,
the system SHALL refuse further workspace-creating joins from that address with
`too_many_requests` and a retry delay, and SHALL not limit re-joins.

### FR-016 — Readiness per entry

WHEN readiness is checked for a workshop,
the system SHALL report template, node-type and model checks for each entry, SHALL report
the workshop as failing only when the backend check fails or no entry passes, and SHALL
mark entries whose template or node-type check fails unavailable to participants. Model
availability does not make an entry unavailable: the participant can still open and edit
it, and a run reports the provider problem.

### FR-017 — Returning to a closed workshop

WHEN a participant who joined a workshop returns to it after it closed or expired,
the system SHALL show the workshop overview read-only instead of the "workshop
unavailable" state.

### FR-018 — The current revision of a followed template is kept

IF a facilitator deletes the current revision of a template that a newest-revision entry
follows,
THEN the system SHALL reject the deletion with `revision_current_in_use`.

## Non-functional requirements

### NFR-001 — A room behind one address can join

The default join limit SHALL admit at least 100 new participants per hour from one network
address.

Verification: unit test on the workspace creation throttle defaults.

## Acceptance criteria

### AC-001 — A workshop offers several templates

Traces to: FR-001, FR-005

```gherkin
Given a facilitator creates a workshop with template A pinned to revision 2 and template B following the newest revision
When the facilitator lists workshops
Then the workshop shows both entries in that order with their modes
```

### AC-002 — Pinned and newest behave differently after a new revision

Traces to: FR-002, FR-003, FR-004

```gherkin
Given a published workshop with template A pinned to revision 2 and template B following the newest revision
And template A and template B each receive a new revision
When a new participant starts both entries
Then the copy of A holds revision 2 and the copy of B holds the new revision
And copies made before the new revisions are unchanged
```

### AC-003 — A pinned entry outlives unpublishing

Traces to: FR-002, FR-003

```gherkin
Given a published workshop with a pinned entry of template A and a newest-revision entry of template B
When the facilitator unpublishes both templates
Then a participant can still join and start the entry of A
And the entry of B is shown as unavailable
```

### AC-004 — Invalid entries are refused

Traces to: FR-005

```gherkin
Given a facilitator edits a workshop
When the entries are empty, name a block template, pin a revision of another template, or the workshop is CLOSED
Then the change is rejected and the stored entries are unchanged
```

### AC-005 — A single-entry workshop opens the editor

Traces to: FR-006, FR-007

```gherkin
Given a published workshop with one entry
When a participant joins for the first time
Then a workshop workspace is established and a copy of the entry is opened in the editor
```

### AC-006 — A multi-entry workshop opens the overview

Traces to: FR-006, FR-008

```gherkin
Given a published workshop with three entries, one of them unavailable
When a participant joins
Then the overview lists the three entries in order with the unavailable one disabled
And no workflow has been created yet
```

### AC-007 — Starting twice opens the same copy

Traces to: FR-009

```gherkin
Given a participant has started entry A
When the participant starts entry A again, or two start requests for it arrive at once
Then both open the same workflow and the workspace holds one copy of A
```

### AC-008 — Foreign entries are invisible

Traces to: FR-010

```gherkin
Given two workshops W1 and W2
When a participant of W1 requests the structure of, or starts, an entry of W2
Then the request is answered as not found
```

### AC-009 — Closing makes the workshop read-only

Traces to: FR-011, FR-012, FR-017

```gherkin
Given a participant is editing a workflow in a published workshop
When the facilitator closes the workshop
Then saving, creating, resetting, restoring and reviewing are rejected with workshop_closed
And a run requested on the already open socket is refused with workshop_closed
And the participant can still open the overview, their workflows and their submissions
```

### AC-010 — Anonymous access is gone

Traces to: FR-013, FR-014

```gherkin
Given no workspace credential
When a client creates a workspace, lists templates or reads a template
Then workspace creation does not exist and template reads are rejected as unauthenticated
And a browser workspace token issued before this change is rejected as invalid
```

### AC-011 — Participants read blocks, not workflow templates

Traces to: FR-014

```gherkin
Given a participant of a workshop
When the participant lists templates or reads a workflow template by slug
Then only block templates are listed and the workflow template is not found
```

### AC-012 — Joins are rate limited, re-joins are not

Traces to: FR-015, NFR-001

```gherkin
Given the join limit for an address is reached
When a new participant from that address joins
Then the join is refused with too_many_requests and a Retry-After header
And a participant from that address who already joined can re-join
```

### AC-013 — Readiness is reported per entry

Traces to: FR-016

```gherkin
Given a workshop whose second entry references an unregistered node type
When the facilitator checks readiness
Then the second entry fails its node-type check, the workshop passes
And participants see the second entry as unavailable
And an entry failing only its model check stays available to participants
```

### AC-014 — The followed revision cannot be deleted

Traces to: FR-018

```gherkin
Given a workshop entry follows the newest revision of template A
When the facilitator deletes the current revision of template A
Then the deletion is rejected with revision_current_in_use
```

## Edge cases

- A participant joined before the workshop gained entries they have no copy of → the
  overview offers them; starting works as for a new participant.
- An entry is removed while a participant has its overview open → starting it answers not
  found; their existing copy stays in "My workflows".
- A workspace holds several copies of one template from before this change → the oldest
  is "the" copy; the others remain ordinary workflows.
- The single entry of a workshop fails to start on join → the participant still receives
  their workspace and sees the overview with the start error.
- A socket connected before the workshop closed → the next run is refused (FR-012).

## Business rules

- A workshop has at least one entry and at most one entry per template.
- Only workflow templates can be workshop entries.
- A participant workspace belongs to exactly one workshop (SPEC-0014).
- Closing is final: a CLOSED workshop is not reopened and its entries are frozen.

## Constraints

- Entry management requires the facilitator role (SPEC-0013).
- Participant routes derive the workspace from the bearer credential only (ADR-0001).
- Schema changes stay additive while `LegacyGraph` exists; the legacy single-template
  columns on `Workshop` are dropped in a later migration.

## Dependencies

- SPEC-0003 (templates, revisions and their visibility).
- SPEC-0004 (workspace model and credentials).
- SPEC-0013 (facilitator authentication).
- SPEC-0014 (workshop entity and join flow this extends).

## Assumptions

- A deployment that wants a public demo publishes a long-running demo workshop and its code.
- Workshops have at most a few dozen entries; the overview does not paginate.

## Open questions

- None currently.

## Success criteria

- A facilitator runs a three-exercise session with one code.
- Without a workshop code, no request reaches a workflow template or a model provider.
- After closing, no participant request of that workshop changes stored state or calls a
  model.

## Change history

| Date       | Change                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-09-25 | Initial specification: workshop template sets, workshop overview, read-only closed workshops, no anonymous workspaces. |
| 2026-09-25 | Implemented: `WorkshopTemplate` model and migration `20260925100000_workshop_template_entries` (legacy `Workshop.templateId`/`templateRevisionId` backfilled, nullable, unused); backend `workshop/workshop-entries.ts`, `workshop.service.ts` (entries on create, `PUT /api/admin/workshops/:id/templates`), `workshop-participant.service.ts` and `WorkshopParticipantController` (join, overview, structure, idempotent start), per-entry `workshop-readiness.service.ts`, read-only enforcement in `WorkspaceGuard` and `GraphHandlerService`, blocks-only workspace-scoped `template.controller.ts`, `revision_current_in_use` in `TemplateService`; `POST /api/workspaces`, `POST /api/workflows/from-template` and `GET /api/templates/revisions/:id` removed; frontend `WorkshopJoin.tsx` overview, `TemplateCard.tsx`, `admin/WorkshopAdmin.tsx`, code-only `StartPage.tsx`, `TemplatesPage`/`WorkflowListPage`/`workspaceSession` removed; tests `workshop-templates.int-spec.ts` and `e2e/workshop-templates.spec.ts`. |
