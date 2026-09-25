---
id: SPEC-0007
type: feature
title: WAIE workshop experience and preview
status: implemented
parent: SPEC-0001
priority: P1
created: 2026-09-15
updated: 2026-09-25
depends_on:
  - SPEC-0003
  - SPEC-0004
  - SPEC-0006
  - SPEC-0014
  - SPEC-0010
  - SPEC-0012
related:
  - SPEC-0002
  - SPEC-0005
  - SPEC-0009
---

# WAIE workshop experience and preview

## Intent

### Problem

The tutorial promises participants a canonical free-text assessment workflow (WAIE)
they can adapt — changing rubrics, feedback strategies, or adding validation/review
steps. No such canonical template exists, and the current preview mixes German UI
labels with English warnings, imposes a hard-coded 10-character minimum answer length,
and fixes the preview drawer at a static width.

### Desired outcome

A canonical WAIE workshop template (Input → Assessment → Classification → Feedback) is
shipped with the product, and the editor's preview becomes a workshop-ready test/trace
experience with English UI and workflow-configurable answer constraints.

## Scope

### In scope

- Canonical WAIE free-text assessment template as the shipped workshop template.
- Preview experience restructured as a Test tab and a Trace tab.
- Test tab: question display, student answer input, run action, results display (score,
  classification, feedback).
- English UI for the participant-facing preview, with localization support.
- Answer length minimum configurable by the workflow, not fixed in the UI.
- Answer length maximum configurable by the workflow (the existing system enforces a
  maximum input constraint; it becomes workflow configuration).

### Out of scope

- Multiple additional workshop templates (the gallery is generic, see SPEC-0003).
- Full internationalization framework beyond EN/DE for participant-facing strings.

## Actors

- Participant (anonymous): runs and adapts the WAIE workflow.
- Facilitator: demonstrates the WAIE workflow during the guided part.

## User scenarios

### US-001 — Adapt one part of the workflow

As a participant,
I want a canonical assessment workflow where I can modify the rubric, feedback
strategy, or add a validation block,
so that I can perform the workshop assignment directly.

Priority: P1

Independent value: this is the workshop's core exercise.

### US-002 — Test the assessment end to end

As a participant,
I want to enter a question and student answer, run the assessment, and see score,
classification, and feedback together,
so that I can evaluate the effect of my changes.

Priority: P1

Independent value: closes the edit → test loop.

### US-003 — Configure answer constraints

As a facilitator,
I want the minimum answer length to be part of the workflow,
so that short-answer grading scenarios are not blocked by a fixed UI rule.

Priority: P2

Independent value: makes the tool usable beyond long free-text answers.

### US-004 — Cap overly long answers

As a facilitator,
I want the maximum answer length to be part of the workflow,
so that I can control input size and cost per assessment run.

Priority: P2

Independent value: preserves the existing maximum-input protection while making it
configurable per workflow instead of hard-coded.

## Functional requirements

### FR-001 — Canonical WAIE template

The system SHALL ship a canonical WAIE free-text assessment template structured as:
Input (question, student answer) → Assessment (rubric, rubric prompt, LLM, score) →
Classification → Feedback (feedback prompt, LLM, feedback output).

### FR-002 — Test tab

WHEN the user opens the preview's Test tab,
the system SHALL display the question (read-only, sourced from the workflow's question
node), a student answer input, a run action, and a results area.

### FR-003 — Question editing via inspector

WHEN the user wants to change the question,
the system SHALL provide editing through the question node in the inspector, not as a
runtime input in the Test tab.

### FR-004 — Results display

WHEN a test run completes,
the system SHALL display every output in the results area, each on its own card titled
by the output node's label and rendered according to the node's display type:

- `text`: the value as prose; an empty value shows a placeholder, never a blank card.
- `score`: the number on a bar against the node's scale maximum (default 100), shown as
  `value / maximum` when the maximum is not 100, with a "Passed" chip at or above the
  node's pass mark (default 60) and a "Not passed" chip below it; a pass mark of zero or
  less shows no chip.
- `classifications`: each label as a chip, coloured by the node's tone map.
- `verdict`: one decision as a chip with an icon — a boolean as "Yes"/"No", a token such
  as `CORRECT` in readable case — coloured by the tone map, and the card carries the
  tone as an accent.
- `report`: a model reply in `KEY: value` lines. The node's "Report lines" map
  (`KEY=role, …`, roles `headline`, `quote`, `body`, `callout`, `hidden`) decides how
  each line is drawn: the first line with the `headline` role becomes a coloured headline
  chip, a leading bare number becomes a points chip out of the scale maximum, `quote`
  renders as a quotation, `body` as prose, `callout` as a highlighted box, `hidden` not at
  all, and unmapped keys as labelled rows. The default map covers the bundled prompts'
  keys (JUDGMENT, CATEGORY, EVIDENCE, REASON, NEXT STEP, GAP, …); a saved `statusKey`
  still names the headline. Keys match ignoring case, spaces and underscores, may use any
  letter, and may be wrapped in markdown, listed or fenced. Raw `KEY:` prefixes never
  reach the reader; text without keys renders as prose.
- `checklist`: one chip per item, ticked when met and crossed when not.
- `measure`: the number on a bar against the scale maximum (default 1) with a caption
  stating that it is evidence, not a grade, and never a pass chip.

WHEN an output node's `detail` input carries text,
the card SHALL show it as a secondary line under the body.

WHEN output nodes carry a section heading,
the results area SHALL group their cards under that heading, sections ordered by first
appearance, cards without a section first.

WHILE the preview is open in the editor (not the student view),
each result card SHALL offer an action that selects and centers the node that produced
the output on the canvas, including a node inside a block.

### FR-011 — Educator-only cards and the student view

An output node and a review flag node SHALL carry an audience of `everyone` (default) or
`educator`, stored with the output so a recorded run renders as the live one did.

WHILE the preview is open in the editor,
an educator-only card SHALL be shown with an "Educator only" chip, and the results area
SHALL offer a "View as student" switch that hides educator-only cards, the locate
affordance and the chips, and states how many cards are hidden.

WHILE the preview is open in the student view,
educator-only cards SHALL NOT be rendered and no switch SHALL be offered. The
Submissions inbox (SPEC-0020) is the educator's and shows every card.

### FR-005 — Trace tab

WHEN the user opens the preview's Trace tab,
the system SHALL display the run trace as defined in SPEC-0006.

### FR-006 — English participant UI

The participant-facing preview interface SHALL be presented in English by default.

### FR-007 — Workflow-configurable minimum answer length

WHILE a workflow defines a minimum answer length,
the test tab SHALL enforce that value instead of any fixed UI-level minimum.

### FR-008 — No fixed answer-length policy

The preview SHALL NOT impose a fixed hard-coded minimum or maximum answer length.

### FR-008a — Workflow-configurable maximum answer length

WHILE a workflow defines a maximum answer length,
the test tab SHALL reject submissions exceeding that value with the configured limit
stated.

### FR-008b — Consistent length bounds

WHEN a workflow defines both a minimum and a maximum answer length,
the system SHALL enforce the pair consistently (minimum not greater than maximum).

### FR-009 — Workshop preflight

WHEN the workshop entry is opened,
the system SHALL perform a preflight check covering: backend connectivity, workshop
template availability, required node types registered, and provider/model health (at
least one allowed LLM model available and its provider reachable), and SHALL present
the results before the participant starts.

### FR-010 — Facilitator readiness view

WHEN the facilitator opens the workshop readiness view,
the system SHALL display the preflight check results for the workshop.

## Non-functional requirements

### NFR-001 — Localization readiness

Participant-facing preview strings SHALL be extractable for localization (at minimum EN
and DE).

Verification: inspection of the participant-facing preview strings; each is sourced from
the extractable EN and DE string tables rather than an inline literal.

## Acceptance criteria

### AC-001 — WAIE template available

Traces to: FR-001

```gherkin
Given the template gallery
When the user browses workflow templates
Then the canonical WAIE free-text assessment template is available and matches the Input → Assessment → Classification → Feedback structure
```

### AC-002 — End-to-end test run

Traces to: FR-002, FR-004

```gherkin
Given the WAIE workflow is open in the editor
When the user enters a student answer and runs the assessment
Then the results area shows a score, a classification, and feedback as separate cards
And each card offers to locate its output node on the canvas
```

### AC-009 — Each display type has its own card

Traces to: FR-004

```gherkin
Given a run emits a verdict output with the boolean false and a detail line
When the results render
Then the card shows a "No" chip and the detail line, never the word "false"
And given a report output "JUDGMENT: INCOMPLETE / EVIDENCE: … / REASON: … / NEXT STEP: …" with headline key JUDGMENT
Then the card shows an "Incomplete" chip, the evidence as a quotation, the reason as body and the next step as a callout, without any "KEY:" prefix
And given a report output whose first line is "1" on a node with maximum 2
Then the card shows a "1 / 2" chip
And given a checklist output with one met and one unmet item
Then the met item shows a tick and the unmet one a cross
And given a measure output of 0.669
Then the card shows the number, a bar and the caption "Evidence, not a grade." and no pass chip
And given a score output of 6 on a node with maximum 8 and pass mark 0
Then the card shows "6 / 8" and no pass chip
And given a score output of 40 on a node with the default pass mark
Then the card shows a "Not passed" chip
And given a text output that is blank
Then the card shows a placeholder instead of an empty body
```

### AC-010 — Educator-only cards and the student view

Traces to: FR-011

```gherkin
Given a run with two educator-only cards and two cards for everyone
When an educator looks at the results in the editor
Then every card renders and the educator-only ones carry an "Educator only" chip
When the educator switches "View as student" on
Then only the two cards for everyone remain, without chips or locate buttons, and a line says two cards are hidden
And given the same run in the student view
Then only the two cards for everyone render and no switch is offered
```

### AC-003 — Question edited in inspector only

Traces to: FR-003

```gherkin
Given the WAIE workflow is open
When the user edits the question through the question node in the inspector
Then the Test tab displays the updated question
And the Test tab provides no question input field
```

### AC-004 — Trace tab available

Traces to: FR-005

```gherkin
Given a run has been executed
When the user opens the Trace tab
Then the run trace is displayed as defined in SPEC-0006
```

### AC-005 — English UI

Traces to: FR-006

```gherkin
Given the preview is open
When the user views the test tab
Then all participant-facing labels and messages are in English
```

### AC-006 — Configurable answer minimum

Traces to: FR-007, FR-008

```gherkin
Given a workflow whose minimum answer length is 0
When the user submits an empty answer attempt shorter than 10 characters
Then the run is permitted (no fixed 10-character block applies)
And when the workflow sets a minimum of 20 characters, a 15-character answer is rejected with the configured limit stated
```

### AC-006a — Configurable answer maximum

Traces to: FR-008a, FR-008b

```gherkin
Given a workflow whose maximum answer length is 500 characters
When the user submits a 600-character answer
Then the submission is rejected with the configured limit stated
And when no maximum is configured, no maximum-length block applies
```

### AC-007 — Preflight blocks broken workshop entry

Traces to: FR-009

```gherkin
Given no LLM model is allowed or no provider is reachable
When the participant opens the workshop entry
Then the preflight reports the failing check
And the participant is not started into a broken workshop
```

### AC-008 — Facilitator readiness view

Traces to: FR-010

```gherkin
Given a facilitator prepares the workshop
When the facilitator opens the workshop readiness view
Then all preflight checks are displayed with pass/fail state
```

## Edge cases

- Test run while another run is in flight → previous run's results are superseded
  clearly or the new run is rejected with feedback.
- WAIE template used outside a workshop → fully functional as a normal template.

## Business rules

- The WAIE template is the canonical workshop starting point; there SHALL be exactly
  one canonical WAIE template.

## Constraints

- None beyond existing template format (SPEC-0003).

## Dependencies

- SPEC-0003 (template mechanism), SPEC-0004 (workspace-owned copies), SPEC-0006
  (trace), SPEC-0014 (workshop join flow and preflight context).
- SPEC-0010 (composite provider+model reference used by the WAIE template and the
  provider/model health check).
- SPEC-0012 (allowed-models definition the preflight verifies against).

## Assumptions

- The result rendering lives in one card component (`ResultCard`) that the Test tab and
  the Submissions inbox share; the parsing behind the `report` and tone-map rules lives
  in the shared library so the node and the card agree.
- The WAIE template references a model by provider id + model id (composite
  reference, SPEC-0010); the workshop preflight verifies that model is allowed and
  its provider reachable before participants start.

## Open questions

- None currently.

## Success criteria

- A participant can complete the assignment (modify rubric / feedback / add
  validation) and verify the effect with a test run in under 10 minutes.
- A facilitator can verify workshop readiness (backend, template, node types, model,
  provider) before the session starts.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created |
| 2026-09-15 | Review revision 2: maximum answer length added as workflow configuration (FR-008a/FR-008b, AC-006a, US-004); preflight wording unified — provider/model health check explicit in FR-009; dependencies re-pointed from the SPEC-0009 epic to SPEC-0010 and SPEC-0012 (composite references and allowed models) in prose and frontmatter |
| 2026-09-17 | Implemented: canonical WAIE template shipped, preview Test/Trace tabs in English with workflow-configured answer bounds, workshop preflight and facilitator readiness view |
| 2026-09-18 | FR-004/AC-002 refined: each result on its own card; editor-only jump from a card to its output node (`outputSet` now carries editor `sourceId`/`wrapperId`) |
| 2026-09-25 | FR-004 rewritten around display types: `verdict`, `report`, `checklist` and `measure` cards added, `score` gains a scale maximum and a pass mark, cards carry a detail line and section headings (AC-009). FR-011/AC-010 added: educator-only cards, the "View as student" switch and the student view (`outputSet` carries `OutputPresentation`). The three workshop templates use the new cards. |
| 2026-09-25 | FR-004 `report`: line roles become the node's editable "Report lines" map (`roles`), replacing the fixed key list and the headline key; keys accept any letter and markdown wrapping. |
