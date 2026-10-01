---
id: SPEC-0002
type: feature
title: Landing page and workshop entry
status: implemented
parent: SPEC-0001
priority: P0
created: 2026-09-15
updated: 2026-10-01
depends_on:
  - SPEC-0004
  - SPEC-0014
related:
  - SPEC-0003
  - SPEC-0022
---

# Landing page and workshop entry

## Intent

### Problem

The application root currently renders a placeholder ("Welcome to the Task Editor") and
the editor assumes graph identity derives from the URL, immediately attempting to load
it. There is no discoverable product entry point and no dedicated path into the
workshop, forcing verbal setup during the session.

During the conference (SPEC-0022) the root was reduced to a workshop code entry. With the
workshop over, NodeGrade is a directly usable application again, and the workshop entry
needs a home of its own that stays one step away from every page.

### Desired outcome

Users landing on `/` see a real start screen for direct use: this browser gets a
workspace of its own, and the start page offers New workflow, My workflows and the
template gallery. Everything workshop-specific lives under `/workshop`, reached through a
title bar that every page outside the editor carries. The conference URL
(`/workshop/:code`) opens the workshop experience directly, as before.

## Scope

### In scope

- Start page rendered at `/` with the entry actions New workflow, My workflows and
  Templates, backed by an anonymous browser workspace.
- A title bar on every page except the editor and the LTI registration popup, linking
  the start page, the workflow list, the template gallery, the workshop hub and the
  facilitator area.
- Workshop hub at `/workshop` with the code entry and the way back to the workshop last
  joined in this browser.
- Dedicated workshop landing route (`/workshop/:code`) that opens the workshop
  experience directly.
- Client-side routing between start page, workshop hub, workshop page, workflow list,
  template gallery and editor.
- Removal of the developer-oriented redirect behavior currently tied to the WebSocket
  reconnect action.

### Out of scope

- Template content itself (SPEC-0003).
- Authentication or personal accounts.
- Visual design system beyond a coherent start-page layout.
- Workshop behaviour behind the join: template entries, pinned or newest revisions,
  read-only closed workshops, the join throttle and readiness preflight stay as
  SPEC-0022 defines them.

## Actors

- Participant (anonymous): needs a frictionless path into the workshop workflow.
- Visitor (anonymous): uses NodeGrade directly from the root with a browser workspace of
  their own.
- Facilitator (admin): owns the workshop and its code; the only role that can create or
  publish a workshop code.
- Expert user: creates and opens workflows directly, without a workshop.

## User scenarios

### US-001 — Enter workshop from conference URL

As a participant,
I want a conference URL that opens the workshop landing page directly,
so that I reach the correct starting point without navigating or asking for help.

Priority: P1

Independent value: removes the main source of verbal coordination at session start.

### US-002 — Start from the product entry

As an expert user,
I want to open the application root and start a new workflow or reopen one of mine,
so that I can work with NodeGrade without a workshop or a learning platform in between.

Priority: P1

Independent value: NodeGrade is usable as a product at its main URL.

### US-003 — Browse templates before editing

As a visitor,
I want a gallery of the published workflow templates with a structure preview,
so that I can start from a complete assessment workflow instead of an empty canvas.

Priority: P2

Independent value: the first workflow of a new user is a working one.

### US-004 — Find the workshop entry from any page

As a participant,
I want the workshop entry one click away on every page,
so that a handout code works wherever I am in the application.

Priority: P2

Independent value: the workshop keeps working after it stopped being the root.

## Functional requirements

### FR-001 — Start page entry actions

WHEN a user opens the application root,
the system SHALL present the entry actions New workflow, My workflows and Templates, a
pointer to the workshop hub for participants with a code, and SHALL establish this
browser's own workspace: the stored one when the server still honours its token, a
freshly created `BROWSER` workspace otherwise, created at most once per page view and kept
in the browser as the active session.

WHEN the server refuses to create the workspace (the per-address throttle of
SPEC-0022/FR-015, or an outage),
the system SHALL show the refusal as a readable message with a retry.

### FR-001a — Start workshop behavior

WHEN a user submits a workshop code on the workshop hub,
the system SHALL resolve the workshop and continue the join flow defined in SPEC-0014
through the `/workshop/:code` route; a code with nothing in it is refused with a
user-facing error and the user stays on the hub.

### FR-002 — Workshop deep link

WHEN a user opens the workshop deep link containing a shared workshop code,
the system SHALL render the workshop landing page for the workshop identified by that
code, following the join flow defined in SPEC-0014.

### FR-003 — New workflow creation

WHEN a user activates New workflow on the start page,
the system SHALL create an empty workflow in this browser's workspace and open the
editor on it.

### FR-003a — Template gallery

WHEN a user opens the template gallery,
the system SHALL list the published workflow templates of this deployment with a
structure preview, read with this browser's workspace credential.

WHEN a user activates Use template,
the system SHALL copy the template's current revision into this browser's workspace and
open the editor on the copy, leaving the template itself unchanged.

### FR-004 — Open existing workflows

WHEN a user opens My workflows,
the system SHALL list only the workflows of this browser's workspace, each opening in
the editor.

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

### FR-007 — Title bar

The system SHALL render a title bar on every page except the editor routes and the LTI
registration popup, carrying the brand as the link to the start page, the destinations
Workflows, Templates, Workshop and Facilitator with the current one marked, and the
appearance picker; on narrow screens the destinations collapse into a menu.

The editor SHALL keep its own toolbar and SHALL offer the way back that fits its
session: Workshop for a workshop session, Home for a browser session, neither for an
LTI launch.

### FR-008 — Workshop hub

WHEN a user opens `/workshop`,
the system SHALL present the workshop code entry, an explanation of what a workshop code
is, and the way back to the workshop this browser joined most recently, surviving later
visits to the start page.

## Non-functional requirements

### NFR-001 — Start page load

The start page SHALL render its interactive entry actions within 2 seconds on a
standard conference laptop connection.

Verification: measured load of the start page on a conference laptop profile; the
interactive entry actions are present within 2 seconds.

## Acceptance criteria

### AC-001 — Root renders start page

Traces to: FR-001, FR-007

```gherkin
Given a fresh browser session
When the user opens the application root
Then the start page is displayed under the title bar with New workflow, My workflows and Templates
And a browser workspace is created once and its token is kept in the browser
And no workshop code entry is offered on the start page
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
Then an empty workflow is created in the browser's workspace and the editor opens on it
And after a reload the editor shows the same workflow in the same workspace
```

### AC-003a — Use template opens a copy

Traces to: FR-003a

```gherkin
Given at least one workflow template is published
When the user opens the template gallery and activates Use template
Then a copy of that template is created in the browser's workspace and the editor opens on it
And the template itself is unchanged
```

### AC-004 — Workflow list is workspace-scoped

Traces to: FR-004, SPEC-0004/FR-001

```gherkin
Given workflows exist in other workspaces
When the user opens My workflows
Then only workflows from the browser's own workspace are listed
```

### AC-005 — Unknown route shows not-found page

Traces to: FR-006

```gherkin
Given the application is running
When the user opens a route that does not exist
Then a user-facing not-found page is shown with a way back to the start page
```

### AC-006 — Start workshop opens code entry

Traces to: FR-001a, FR-008

```gherkin
Given the user is on the workshop hub
When the user enters a valid workshop code and activates Join
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

### AC-008 — Title bar on every page but the editor

Traces to: FR-007

```gherkin
Given any page outside the editor
Then the title bar offers Workflows, Templates, Workshop and Facilitator, with the current destination marked
When the user opens a workflow in the editor
Then no title bar is shown
And the editor offers Workshop for a workshop session, Home for a browser session, and neither for an LTI launch
```

### AC-009 — Way back to the last workshop

Traces to: FR-008

```gherkin
Given this browser joined a workshop earlier and has used the start page since
When the user opens the workshop hub
Then "Continue where you left off" leads to that workshop's overview
```

### AC-010 — Workspace bootstrap failure is retryable

Traces to: FR-001

```gherkin
Given the server refuses to create a workspace
When the user opens the application root
Then a readable message with a Retry action is shown instead of a blank page
When the user retries and the server accepts
Then the entry actions work
```

## Edge cases

- Deep link with an invalid, expired, unpublished, or closed workshop code → not-found
  or "workshop unavailable" state, not a blank page.
- Workspace cannot be established (storage failure, throttle) → user-facing error with
  retry (AC-010).
- The stored browser token is no longer honoured (retention sweep, reset database) → it
  is replaced by a fresh workspace without the user noticing.

## Business rules

- A workshop code SHALL identify exactly one workshop and SHALL be shareable with
  participants (e.g. printed in the tutorial handout).
- The workshop deep link is only published for workshops the facilitator has prepared.
- The start page, My workflows and the template gallery act on this browser's own
  workspace; a workshop route acts on that workshop's workspace. The editor opens a
  workflow with the session the hub used last made active, because every workflow
  belongs to exactly one workspace. A direct-entry page makes the browser session active
  each time it is shown and again as it hands a workflow to the editor; a workshop route
  makes that workshop's session active as it joins. A bootstrap that resolves after the
  participant left the direct-entry page activates nothing.

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
- A visitor reaching the application root is in the editor in one click.
- No user-visible flow requires knowing the internal editor URL scheme.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created |
| 2026-09-15 | Added facilitator (admin) ownership of workshop codes: creation restricted to facilitator, revocation support (FR-007..FR-009, AC-006..AC-007) |
| 2026-09-16 | Implemented: start page code entry now resolves through the `/workshop/:code` join route so FR-001a and FR-002 share one flow; `/editor` and `/student` without a workflow redirect to the start page (FR-005); workspace bootstrap failures are retryable (edge case); `POST /api/workspaces` token and `GET /api/workspaces/me` response shapes corrected in the HTTP client, which had been dropping the workspace token |
| 2026-09-15 | Review revision: workshop code lifecycle FRs (FR-007..FR-009) removed — normatively defined by SPEC-0014 (avoids drift); AC-006 replaced with Start-workshop code-entry behavior (FR-001a), AC-007 now traces to SPEC-0014/FR-008; SPEC-0014 added to frontmatter depends_on |
| 2026-09-25 | SPEC-0022 makes the workshop code the only entry: FR-001, FR-003, FR-004, US-002, US-003 and AC-003 superseded; AC-001 and AC-004 amended (code-only start page, "My workflows" on the workshop overview); intent, scope and actors amended |
| 2026-10-01 | The workshop is over: direct use returns to the root. FR-001, FR-003, FR-004, US-002, US-003 and AC-003 are live again with the browser workspace; FR-003a and AC-003a (template gallery with Use template), FR-007 and AC-008 (title bar, editor way home), FR-008 and AC-009 (the `/workshop` hub with the code entry and the way back), AC-010 (retryable bootstrap) added; FR-001a and AC-006 moved to the hub; US-004 added |
| 2026-10-01 | Business rules: activating a session is the page's job — a direct-entry page activates the browser session on every view and as it opens the editor, a workshop route as it joins; the bootstrap itself activates nothing |
