---
id: SPEC-0002
type: feature
title: Landing page and workshop entry
status: implemented
parent: SPEC-0001
priority: P0
created: 2026-09-15
updated: 2026-09-16
depends_on:
  - SPEC-0004
  - SPEC-0014
related:
  - SPEC-0003
---

# Landing page and workshop entry

## Intent

### Problem

The application root currently renders a placeholder ("Welcome to the Task Editor") and
the editor assumes graph identity derives from the URL, immediately attempting to load
it. There is no discoverable product entry point and no dedicated path into the
workshop, forcing verbal setup during the session.

### Desired outcome

Users landing on `/` see a real start screen with distinct entries for the workshop,
template gallery, new workflow, and continuing an existing workflow. The conference URL
opens the workshop experience directly.

## Scope

### In scope

- Start page rendered at `/` with four entry actions.
- Dedicated workshop landing route (e.g. `/workshop/waie`) that opens the workshop
  experience directly.
- Client-side routing between start page, workshop page, template gallery, editor, and
  workflow listing.
- Removal of the developer-oriented redirect behavior currently tied to the WebSocket
  reconnect action.

### Out of scope

- Template content itself (SPEC-0003).
- Authentication or personal accounts.
- Visual design system beyond a coherent start-page layout.

## Actors

- Participant (anonymous): needs a frictionless path into the workshop workflow.
- Facilitator (admin): owns the workshop and its code; the only role that can create or
  publish a workshop code.
- Expert user: needs direct access to create/open workflows.

## User scenarios

### US-001 — Enter workshop from conference URL

As a participant,
I want a conference URL that opens the workshop landing page directly,
so that I reach the correct starting point without navigating or asking for help.

Priority: P1

Independent value: removes the main source of verbal coordination at session start.

### US-002 — Start from the product entry

As an expert user,
I want a start page with New workflow and Open workflow actions,
so that I can use NodeGrade outside a workshop without understanding its URL scheme.

Priority: P2

Independent value: makes `/` a genuine product entry point for all users.

### US-003 — Browse templates before editing

As a participant,
I want to reach a template gallery from the start page,
so that I can choose a starting workflow visually.

Priority: P2

Independent value: makes the template capability discoverable (see SPEC-0003).

## Functional requirements

### FR-001 — Start page entry actions

WHEN a user opens the application root,
the system SHALL present entry actions for: Start workshop, Templates, New workflow,
and Open workflow (My workflows).

### FR-001a — Start workshop behavior

WHEN a user activates Start workshop from the start page,
the system SHALL present a workshop code entry flow that, upon submission of a code,
resolves the workshop and continues the join flow defined in SPEC-0014.

### FR-002 — Workshop deep link

WHEN a user opens the workshop deep link containing a shared workshop code,
the system SHALL render the workshop landing page for the workshop identified by that
code, following the join flow defined in SPEC-0014.

### FR-003 — New workflow creation

WHEN a user activates New workflow from the start page,
the system SHALL create a new empty workflow in the user's workspace and open it in the
editor.

### FR-004 — Open existing workflows

WHEN a user activates Open workflow,
the system SHALL list only workflows belonging to the user's workspace.

### FR-005 — No URL-derived identity assumption

WHEN the editor is opened without a workflow identity in the URL,
the system SHALL present a user-facing starting point instead of attempting to load a
graph derived from the URL.

Verification: routing test that opens the editor route without a workflow identity and
asserts the start page is presented without a graph load attempt.

### FR-006 — Not-found page

WHEN a user opens an unknown route,
the system SHALL display a user-facing not-found page offering navigation back to the
start page.

Note: workshop code lifecycle (create, publish, close) is normatively defined in
SPEC-0014; this feature only consumes it for code entry and deep-link resolution.

## Non-functional requirements

### NFR-001 — Start page load

The start page SHALL render its interactive entry actions within 2 seconds on a
standard conference laptop connection.

Verification: measured load of the start page on a conference laptop profile; the
interactive entry actions are present within 2 seconds.

## Acceptance criteria

### AC-001 — Root renders start page

Traces to: FR-001

```gherkin
Given a fresh browser session
When the user opens the application root
Then the start page is displayed with Start workshop, Templates, New workflow, and Open workflow actions
```

### AC-002 — Conference URL opens workshop

Traces to: FR-002

```gherkin
Given the workshop is published and the participant has a valid workshop code
When the user opens the workshop deep link containing that code
Then the workshop landing page for that workshop is shown directly
```

### AC-003 — New workflow opens editor

Traces to: FR-003

```gherkin
Given the user is on the start page
When the user activates New workflow
Then a new workflow exists in the user's workspace and the editor opens with an empty canvas
```

### AC-004 — Workflow list is workspace-scoped

Traces to: FR-004, SPEC-0004/FR-001

```gherkin
Given workflows exist in other workspaces
When the user activates Open workflow
Then only workflows from the user's own workspace are listed
```

### AC-005 — Unknown route shows not-found page

Traces to: FR-006

```gherkin
Given the application is running
When the user opens a route that does not exist
Then a user-facing not-found page is shown with a way back to the start page
```

### AC-006 — Start workshop opens code entry

Traces to: FR-001a

```gherkin
Given the user is on the start page
When the user activates Start workshop and enters a valid workshop code
Then the join flow defined in SPEC-0014 proceeds for that workshop
And entering an invalid code shows a user-facing error
```

### AC-007 — Closed code rejected

Traces to: FR-002, SPEC-0014/FR-008

```gherkin
Given a workshop that the facilitator has closed
When a participant opens the deep link containing that code
Then the workshop is not accessible and a "workshop unavailable" state is shown
```

## Edge cases

- Deep link with an invalid, expired, unpublished, or closed workshop code → not-found
  or "workshop unavailable" state, not a blank page.
- Workspace cannot be established (storage failure) → user-facing error with retry.

## Business rules

- A workshop code SHALL identify exactly one workshop and SHALL be shareable with
  participants (e.g. printed in the tutorial handout).
- The workshop deep link is only published for workshops the facilitator has prepared.

## Constraints

- Frontend routing must remain client-side; no server-side rendering requirement.

## Dependencies

- SPEC-0004 (workspace identity needed for meaningful "My workflows" listing).
- SPEC-0014 (Workshop entity, codes, and join flow that the deep link resolves).

## Assumptions

- A single canonical workshop (WAIE) is needed for the conference; multiple concurrent
  workshop definitions are not required.

## Success criteria

- A participant reaching the conference URL lands in the workshop in one step.
- No user-visible flow requires knowing the internal editor URL scheme.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created |
| 2026-09-15 | Added facilitator (admin) ownership of workshop codes: creation restricted to facilitator, revocation support (FR-007..FR-009, AC-006..AC-007) |
| 2026-09-16 | Implemented: start page code entry now resolves through the `/workshop/:code` join route so FR-001a and FR-002 share one flow; `/editor` and `/student` without a workflow redirect to the start page (FR-005); workspace bootstrap failures are retryable (edge case); `POST /api/workspaces` token and `GET /api/workspaces/me` response shapes corrected in the HTTP client, which had been dropping the workspace token |
| 2026-09-15 | Review revision: workshop code lifecycle FRs (FR-007..FR-009) removed — normatively defined by SPEC-0014 (avoids drift); AC-006 replaced with Start-workshop code-entry behavior (FR-001a), AC-007 now traces to SPEC-0014/FR-008; SPEC-0014 added to frontmatter depends_on |
