---
id: SPEC-0020
type: feature
title: Review flags and submission history
status: implemented
parent: SPEC-0001
priority: P1
created: 2026-09-22
updated: 2026-09-25
depends_on:
  - SPEC-0004
  - SPEC-0006
  - SPEC-0007
related:
  - SPEC-0003
  - SPEC-0005
  - SPEC-0019
---

# Review flags and submission history

## Intent

### Problem

The bundled workshop graphs already ask a model to recommend `EDUCATOR_REVIEW` or `KEEP_AS_DRAFT`, but that recommendation reaches the participant as ordinary text in an ordinary result card, indistinguishable from feedback. Nothing about a run survives the next attempt: outputs live in browser state and are wiped when the participant runs again (SPEC-0006 keeps the trace deliberately ephemeral). A participant therefore never experiences the part of the product a tutor would live in — a queue of submissions in which some are flagged for a human look — and cannot compare how a change to the review policy alters which answers get flagged.

### Desired outcome

A participant plays the tutor. Every run they make becomes a persisted submission in their own workspace; a structured review flag marks the ones a human should look at; a Submissions tab in the preview rail shows counts, a list, a detail view, lets them mark submissions as reviewed and re-run an old answer against the current graph. All three bundled workshop graphs and the validation-review block carry the flag so the facilitator can walk the same loop in every example, and a participant who copies or builds a graph inherits the same inbox.

## Scope

### In scope

- A review flag node type in the shared node library that turns a reviewer's text (or a boolean) into a structured verdict.
- A `review` output type on the run event contract, with a verdict, and a distinct result card for it.
- The three workshop templates and the validation-review block each carrying one review flag; the water-cycle template gaining a review stage.
- One persisted run record per completed or failed execution, holding the answer, the outputs and the derived flag, scoped to the workspace that ran it.
- A workspace-scoped REST surface to list, read and mark runs as reviewed.
- A Submissions tab in the preview rail with counts, filter, list, detail, mark-reviewed and run-again actions.
- Retention: run records go with their workspace and workflow, and a per-workflow cap.

### Out of scope

- A facilitator view across all workspaces of a workshop.
- Persisting or replaying the run trace; SPEC-0006 keeps it per-run and ephemeral.
- A release gate: no output is withheld from the participant because a run is flagged.
- Editing outputs or feedback from the inbox.
- Notifications, assignment to tutors, or any workflow beyond reviewed / not reviewed.
- Purging run records from the facilitator UI.

## Actors

- Participant: runs answers against their workflow copy, plays the tutor, decides what to look at, marks submissions reviewed, re-runs old answers after changing the graph.
- Facilitator: demonstrates the recommend → flag → inbox loop in the presentation using the bundled graphs.
- LTI instructor: sees learners' submissions for a launched workflow as a real inbox.
- LTI learner: runs a published workflow; never sees the inbox.

## User scenarios

### US-001 — See which answers a tutor should look at

As a participant,
I want a flagged run to be visibly different from a clear one,
so that I know which submissions the assessment workflow could not settle on its own.

Priority: P1

Independent value: the review recommendation the templates already produce becomes a signal instead of prose.

### US-002 — Work through submissions like a tutor

As a participant,
I want a list of everything I ran, with the flagged ones counted,
so that I can open each one, read the answer and results, and mark it as reviewed.

Priority: P1

Independent value: the workshop participant experiences the tutor's view of the product, not only the author's.

### US-003 — Re-run an old answer after changing the graph

As a participant,
I want to run an earlier submission's answer again with one action,
so that I can see whether my change to the review policy flips its flag.

Priority: P1

Independent value: this is the core workshop activity; without it a participant retypes answers to compare.

### US-004 — Come back later

As a participant,
I want my submissions to still be there after a reload or the next day,
so that a workshop session survives a page refresh or a break.

Priority: P2

Independent value: the inbox is a record, not a session artefact.

## Functional requirements

### FR-001 — Review flag node

The shared node library SHALL provide a node type `output/review-flag`, listed in the Assessment category, with one input accepting a string or a boolean, one boolean output, and the properties `label`, `flagPattern` (default `EDUCATOR_REVIEW`), `reasonPrefix` (default `REASON:`), `reasonOnlyWhenFlagged` (default false), `audience` (default `everyone`) and `section` (default empty). WHEN the node executes with a boolean input, the boolean SHALL be the verdict and the reason SHALL be empty. WHEN it executes with text, the run SHALL be flagged if the text contains any comma-separated marker from `flagPattern`, compared case-insensitively, and the reason SHALL be the first line beginning with `reasonPrefix` without that prefix, or the whole trimmed text when no such line exists. WHILE `reasonOnlyWhenFlagged` is on, a clear run SHALL emit an empty reason.

### FR-002 — Review output and its card

WHEN a review flag node executes, the system SHALL emit an output of type `review` carrying the node's label, a verdict of `flagged` or `clear`, the reason as its value, and the node's audience and section, over the same event the other outputs use. The preview SHALL render a `review` output on its own card: a flagged one with warning styling and a "Needs review" chip, a clear one with a "No issue found" chip, the reason as the body when there is one, and a caption stating that it is a recommendation, not an approval. An educator-only review card follows SPEC-0007/FR-011: shown with a chip to educators, hidden from students. A flagged run SHALL NOT withhold or alter any other output.

### FR-003 — Bundled graphs carry the flag

Each of the three bundled workshop templates and the validation-review block SHALL contain exactly one review flag node fed by a language-model node. The words-versus-understanding template SHALL flag on `JUDGMENT: UNCLEAR` and show its reason only when flagged, because that reason justifies the judgment, not the flag; the water-cycle template SHALL gain a review stage that checks the criterion reports and the draft feedback against the answer and prints the same `RECOMMENDATION:` / `REASON:` contract the pizza template uses. In all three workshop templates the flag is the only card the review stage produces, and it is educator-only.

### FR-004 — A run becomes a record

WHEN a run reaches `completed`, or reaches `failed` after execution started, the system SHALL persist one run record holding the run id, the workspace and workflow it ran in, the outcome, the participant's answer, the outputs the run emitted (after the sanitisation SPEC-0006 applies to trace values), the first score output when present, the derived flag and reason, the sanitised error message on failure, and the start and finish times. The record SHALL be written before the terminal run-state event is emitted. The system SHALL NOT persist the trace, and SHALL NOT record a cancelled run or a run that failed before execution started.

### FR-005 — Flag derivation

A run record SHALL be marked flagged if any of its outputs is a `review` output with the verdict `flagged`, and its reason SHALL be the reasons of those outputs; a run whose review flag node never executed SHALL NOT be flagged.

### FR-006 — Workspace-scoped run history

The system SHALL expose, under the workflow's REST path and behind the workspace bearer token, a list of run records with a filter (all, needs review, reviewed, failed) and summary counts, a single record with its answer and outputs, and an action that marks a record reviewed or not with an optional note. Every query SHALL be scoped to the calling workspace; a workflow or run outside it SHALL answer not found. A run SHALL count as needing review while it is flagged and not yet reviewed.

### FR-007 — Learners never see the inbox

WHEN the caller is an LTI launch that carries the published projection (a learner, not the instructor), the run history endpoints SHALL refuse the request and the preview SHALL NOT show the Submissions tab. Learner runs SHALL still be recorded, carrying the launch's display name, so the instructor's inbox is complete.

### FR-008 — Retention

Run records SHALL be deleted with their workspace and with their workflow. After recording a run the system SHALL keep at most the newest 200 records of that workflow.

### FR-009 — Submissions tab

The preview rail SHALL offer a Submissions tab next to Test and Trace whose label carries the number of submissions needing review. The tab SHALL show three counts (submissions, needs review, reviewed), a filter (all, needs review, reviewed, failed), and a list newest first in which each row shows the time, an excerpt of the answer, a status chip (needs review, no issue found, reviewed, failed) and the score when the graph produced one. WHEN the workflow has no records, the tab SHALL show an empty state inviting the participant to run an answer.

### FR-010 — Submission detail

WHEN a participant opens a submission, the system SHALL show the full answer, the run's result cards rendered as the Test tab renders them but without the locate action, the flag reason when flagged, and the error when failed, with a way back to the list.

### FR-011 — Mark reviewed and reopen

WHEN a participant marks a completed submission as reviewed, optionally with a note, the system SHALL persist the review time and note and update the counts and the row's status without a page reload; a reviewed submission SHALL offer to be reopened, which clears the review.

### FR-012 — Run again

WHEN a participant chooses to run a submission again, the system SHALL place that submission's answer in the Test tab, switch to it and start a run against the current graph, so that the new run appears as a new submission.

## Non-functional requirements

### NFR-001 — Recording never fails a run

A failure to write the run record SHALL be logged and SHALL NOT change the outcome, the events or the outputs the participant receives.

### NFR-002 — Bounded storage

Persisted output values SHALL be capped per value and per run, and the stored answer SHALL be capped in length, so that a run record stays small regardless of what a graph emits.

## Acceptance criteria

### AC-001 — Text with the marker is flagged, boolean is the verdict

Traces to: FR-001

```gherkin
Given a review flag node with the default markers and reason prefix
When it receives "RECOMMENDATION: EDUCATOR_REVIEW\nREASON: The category is not supported."
Then its boolean output is true
And the reason is "The category is not supported."
And given instead the text "RECOMMENDATION: KEEP_AS_DRAFT\nREASON: Fine."
Then its boolean output is false and the reason is "Fine."
And given instead the boolean true
Then its boolean output is true and the reason is empty
```

### AC-002 — The review card looks different from feedback

Traces to: FR-002

```gherkin
Given a run whose graph emits a review output with verdict flagged and reason "Contradictory claims."
When the results render on the Test tab
Then a card titled with the node's label shows a "Needs review" chip, the reason and the caption "A recommendation, not an approval."
And every other output card renders as before
And given instead the verdict clear
Then the card shows a "No issue found" chip
```

### AC-003 — Every bundled workshop graph flags

Traces to: FR-003

```gherkin
Given the three bundled workshop templates and the validation-review block
When their content is inspected
Then each contains exactly one output/review-flag node whose input is linked from a models/llm node
And the words-versus-understanding flag matches "JUDGMENT: UNCLEAR"
And the water-cycle template has a review model downstream of every grader and the feedback model
```

### AC-004 — A completed run is recorded before the client hears it finished

Traces to: FR-004, FR-005, NFR-001

```gherkin
Given a workspace runs a workflow whose review flag emits verdict flagged
When the run completes
Then one run record exists with that run id, the answer, the emitted outputs, flagged true and the reason
And the record was written before the completed run-state event was emitted
And given instead the record write throws
Then the participant still receives the completed event and the outputs
And given instead the run is cancelled or rejected before execution
Then no record exists
```

### AC-005 — History is scoped to the caller's workspace

Traces to: FR-006

```gherkin
Given workspace A and workspace B each ran the same template
When workspace A lists its runs for its workflow
Then it sees only its own records with counts that add up
And when workspace A requests a run id belonging to workspace B
Then the answer is not found
And when workspace A marks one of its runs reviewed with a note
Then the run reports reviewed with that note and no longer counts as needing review
```

### AC-006 — A learner launch is refused, an instructor sees learners

Traces to: FR-007

```gherkin
Given an LTI launch for a learner and one for the instructor of the same resource link
When the learner runs the workflow
Then a run record exists in the shared workspace carrying the learner's display name
And the learner's preview shows no Submissions tab and the learner's history request is refused
And the instructor's list shows that submission
```

### AC-007 — Records go with their owners and stay bounded

Traces to: FR-008, NFR-002

```gherkin
Given a workflow with 200 run records
When another run completes
Then the oldest record is gone and 200 remain
And when the workspace is deleted by the retention sweep
Then none of its run records remain
And given a run whose output value exceeds the per-value cap
Then the stored value is truncated and marked as such
```

### AC-008 — The inbox counts, filters and lists

Traces to: FR-009

```gherkin
Given a workflow with three records: one flagged, one clear and one failed
When the participant opens the Submissions tab
Then the tab label reads "Submissions (1)"
And the tiles read submissions 3, needs review 1, reviewed 0
And the list shows three rows newest first with the chips "Needs review", "No issue found" and "Failed"
And choosing the needs-review filter leaves one row
And given instead a workflow with no records
Then the tab shows the empty state
```

### AC-009 — Detail shows the answer and the cards

Traces to: FR-010

```gherkin
Given a flagged submission in the list
When the participant opens it
Then the full answer, the flag reason and the run's result cards are shown without locate buttons
And a Back action returns to the list
```

### AC-010 — Reviewed and reopened

Traces to: FR-011

```gherkin
Given an open flagged submission
When the participant enters a note and marks it as reviewed
Then the status chip reads "Reviewed", the tab label count drops by one and a Reopen action appears
And when the participant reopens it
Then the status returns to "Needs review"
```

### AC-011 — Run again re-submits the old answer

Traces to: FR-012

```gherkin
Given an open submission whose answer is "Because the Sun moves."
When the participant chooses Run again
Then the Test tab is shown with that answer in the input and a run starts
And when the run finishes
Then the list has one more row
```

## Edge cases

- A model echoes the instruction line `RECOMMENDATION: EDUCATOR_REVIEW or KEEP_AS_DRAFT` verbatim → the run is flagged; erring toward a human look is the intended direction.
- A review flag node inside a block → the output carries the block wrapper and inner node ids like every other output; flag detection is independent of nesting.
- A review flag node whose upstream failed → it never executes, the run is failed and not flagged.
- Two runs in flight in one workspace → each record holds only its own outputs.
- A run from unsaved editor state → recorded against the workflow id; no graph snapshot is stored, so the locate action is not offered on stored outputs.
- Output order → stored in execution order, which can differ between runs.
- Two runs finishing at once on a workflow at the cap → both may trim; the trim deletes by id and is idempotent.
- The answer is empty → recorded as an empty answer; the row shows a placeholder.
- The workflow is deleted while the tab is open → the next refresh answers not found and the tab shows an error with retry.

## Business rules

- A flag is a recommendation, never a gate: every output still reaches the participant.
- Reviewed means a participant signed it off; it says nothing about correctness.
- Only the workspace that ran a submission can read or review it.
- LTI workspaces are not swept by retention (SPEC-0004), so their run records live until the per-workflow cap or a workflow deletion removes them.
- Stored error messages are the sanitised generic messages SPEC-0006 allows, never provider text.

## Constraints

- The node lives in `packages/lib` and is registered once through the node definition registry; the frontend and backend both import it from there.
- The `review` output travels on the existing `outputSet` event; the added verdict field is optional so stored output nodes keep loading (SPEC-0006).
- Run records are written by the execution handler, not over REST; REST only reads and marks them (a deliberate addition to ADR-0002, recorded as ADR-0009).
- Workspace authorisation comes from the bearer token only; no handler reads a workspace id from the request (ADR-0001, SPEC-0004).
- Bundled template content changes create a new bundled revision on boot (ADR-0003); workshops pinned to an older revision keep it.
- Participant-facing strings live in the preview i18n table in English and German.

## Dependencies

- SPEC-0004 (workspace isolation: run records and the history surface are scoped by the resolved workspace, and retention cascades through it).
- SPEC-0006 (run and trace observability: the `outputSet` event and the trace sanitiser the record reuses; the trace itself stays ephemeral).
- SPEC-0007 (preview: the Test tab, its result cards and the rail the Submissions tab joins).

## Assumptions

- A participant's runs in a workshop are test inputs they typed themselves, not learner data.
- The bundled review prompts keep the two-line `RECOMMENDATION:` / `REASON:` contract; a facilitator who changes it also changes the node's markers.
- Fifty rows per list request are enough for a workshop session.

## Open questions

- Should LTI run records have a retention window of their own, given LTI workspaces are never swept? Deferred; the per-workflow cap bounds them for now.
- Should the facilitator get an aggregate view across a workshop's workspaces? Out of scope here; the table supports it.

## Success criteria

- In the presentation, a contradictory pizza answer produces a warning card and a Submissions count of one, in every bundled example.
- A participant changes the review policy, runs two old submissions again and sees one flag flip without retyping anything.
- Reloading the editor keeps the inbox.

## Change history

| Date       | Change                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| 2026-09-22 | Initial specification created (draft). FR-001 to FR-003 land with the review flag node.      |
| 2026-09-22 | FR-004 to FR-008, NFR-001 and NFR-002 implemented: `Run` model and migration, `packages/backend/src/run/`, record written by the run handler before the terminal event (ADR-0009). |
| 2026-09-22 | FR-009 to FR-012 implemented: Submissions tab in the preview rail (`SubmissionsView`, `useSubmissions`), mark reviewed / reopen, run again; browser check `e2e/submissions.spec.ts`. Status: implemented. |
| 2026-09-25 | FR-001 to FR-003 extended: the flag node gains `reasonOnlyWhenFlagged`, `audience` and `section`; the review output carries them; workshop templates make the flag educator-only and drop the duplicate "Review recommendation" text card (SPEC-0007/FR-011). |
