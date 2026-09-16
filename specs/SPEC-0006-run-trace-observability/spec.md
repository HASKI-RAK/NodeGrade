---
id: SPEC-0006
type: feature
title: Run and trace observability
status: implemented
parent: SPEC-0001
priority: P1
created: 2026-09-15
updated: 2026-09-16
depends_on:
  - SPEC-0004
related:
  - SPEC-0005
  - SPEC-0007
---

# Run and trace observability

## Intent

### Problem

Workflow execution currently signals progress mainly by coloring the executing node
green; users only see final OutputNode results. The tutorial explicitly promises
participants insight into intermediate outputs, workflow structure, and reliability —
which requires per-node execution visibility.

### Desired outcome

A run/trace view listing each executed node in order with status, timing, and
(intermediate) outputs. Clicking a trace step highlights the corresponding node on the
canvas.

## Scope

### In scope

- Richer node execution events carrying node identity, status, timing, and optionally
  inputs/outputs.
- A trace panel listing per-node execution steps for the current run.
- Trace-to-canvas highlighting.
- Redaction of sensitive content (prompts/model internals) where appropriate.

### Out of scope

- Persistent run history across sessions (only the current run's trace is required).
- Replay or step-debugging of execution.
- Performance profiling dashboards.

## Actors

- Participant (anonymous): inspects intermediate outputs to understand the workflow.
- Facilitator: demonstrates transparency of the assessment pipeline.
- Expert user: diagnoses workflow behavior and errors.

## User scenarios

### US-001 — See intermediate outputs

As a participant,
I want to see each node's output during a run,
so that I understand how my assessment strategy produces its result step by step.

Priority: P1

Independent value: delivers the "transparent assessment workflow" concept.

### US-002 — Locate a failing node

As an expert user,
I want the trace to show which node failed and why,
so that I can fix the workflow without guessing.

Priority: P2

Independent value: makes errors actionable.

### US-003 — Jump from trace to canvas

As a participant,
I want clicking a trace step to highlight the node on the canvas,
so that I can connect the trace to the workflow structure.

Priority: P2

Independent value: links observation with structure.

## Functional requirements

### FR-001 — Node execution events

WHEN a node starts executing,
the system SHALL emit an execution event identifying the node, its status, and its
start time.

### FR-002 — Node completion events

WHEN a node finishes executing,
the system SHALL emit a completion event identifying the node, its status (completed or
failed), its duration, and optionally its outputs.

### FR-003 — Trace view

WHEN a run is executed,
the system SHALL display a trace view listing each node execution in chronological
order with status and duration.

### FR-004 — Trace shows outputs

WHEN a node's completion event includes outputs,
the trace view SHALL display the node's output content for that step.

### FR-005 — Trace-to-canvas highlight

WHEN a user activates a step in the trace view,
the system SHALL highlight the corresponding node on the canvas.

### FR-006 — Error reporting in trace

IF a node fails during execution,
THEN the trace view SHALL mark the step as failed and display the error information.

### FR-007 — Output redaction

WHERE node outputs contain sensitive prompt or model configuration content,
the system SHALL redact that content in trace output before it reaches the client.

### FR-008 — Global fail-fast execution

IF a node fails during execution,
THEN the system SHALL stop the run entirely, SHALL NOT start any further nodes in that
run, SHALL cancel in-flight node executions where the execution mechanism permits,
and SHALL disregard late results from already-running nodes.

### FR-009 — Run correlation

WHEN a run is started,
the system SHALL assign it a unique run id, and every execution event of that run
SHALL carry the run id, the workflow id, the node id, and a timestamp.

### FR-010 — Run states

The system SHALL support run states: queued, running, completed, failed, and
cancelled, and SHALL report the state transitions in the trace view.

### FR-010a — Node execution states

The system SHALL support per-node execution states: queued, running, completed,
failed, skipped, and cancelled. Nodes that never start because the run stopped early
SHALL be reported as skipped (run failed) or cancelled (run cancelled); skipped and
cancelled SHALL NOT be used as run states.

### FR-011 — Execution timeout

IF a node execution exceeds a configured timeout,
THEN the system SHALL mark the node and the run as failed.

### FR-012 — Run cancellation

WHEN a user cancels a run,
the system SHALL stop the run and mark remaining nodes as cancelled.

### FR-013 — Trace delivery scoped to the run owner

WHEN trace events are delivered,
the system SHALL deliver them only to the workspace that owns the run and SHALL NOT
broadcast them globally.

### FR-014 — Sanitized provider errors

IF a provider error is included in trace output,
THEN the system SHALL sanitize it so that no headers, credentials, or provider
account identifiers are exposed.

## Non-functional requirements

### NFR-001 — Trace event latency

Trace events for a node SHALL be visible in the client within 1 second of the event
being emitted by the server.

Verification: timed run measuring the delay between server-side event emission and
client-side trace display; within 1 second.

### NFR-002 — Redaction completeness

Trace output SHALL NOT contain API keys or model credentials under any circumstances.

## Acceptance criteria

### AC-001 — Trace lists all steps

Traces to: FR-001, FR-002, FR-003

```gherkin
Given a workflow with three connected nodes
When the user runs the workflow
Then the trace view lists all three node executions in order with status and duration
```

### AC-002 — Trace shows intermediate output

Traces to: FR-004

```gherkin
Given a node emits outputs on completion
When the run completes
Then the trace view shows that node's output content at its step
```

### AC-003 — Trace highlights node

Traces to: FR-005

```gherkin
Given a completed run with a trace
When the user activates a trace step
Then the corresponding node is highlighted on the canvas
```

### AC-004 — Failed node visible in trace

Traces to: FR-006

```gherkin
Given a node that fails during a run
When the run ends
Then the trace view marks that step as failed and shows error information
```

### AC-005 — Credentials never in trace

Traces to: FR-007, FR-014, NFR-002

```gherkin
Given a workflow containing nodes with model credentials
When a run completes
Then the trace output contains no API keys, model credentials, headers, or provider account identifiers
```

### AC-006 — Fail-fast stops the entire run

Traces to: FR-008

```gherkin
Given a workflow where node B depends on node A and node A fails
When the user runs the workflow
Then no further nodes are executed after node A
And the trace view shows the run stopped at node A
```

### AC-007 — Events carry run id

Traces to: FR-009

```gherkin
Given two runs of the same workflow started in quick succession
When execution events arrive interleaved
Then each event is attributable to its run via the run id
And each trace view shows only its own run's events
```

### AC-008 — Timeout marks run failed

Traces to: FR-011

```gherkin
Given a node whose execution exceeds the configured timeout
When the timeout elapses
Then the node and the run are marked failed
And the trace view shows the timeout as the failure reason
```

### AC-009 — Cancellation marks remaining nodes cancelled

Traces to: FR-010, FR-010a, FR-012

```gherkin
Given a run in progress
When the user cancels the run
Then the run is marked cancelled
And nodes that had not started are marked cancelled (not the run itself)
```

### AC-009a — Fail-fast with in-flight parallel nodes

Traces to: FR-008

```gherkin
Given a run with node A and node B executing in parallel and node A fails
When fail-fast applies
Then no new nodes are started
And node B's in-flight execution is cancelled where the mechanism permits
And any late result from node B is disregarded
And the run is marked failed
```

### AC-010 — Trace not visible to other workspaces

Traces to: FR-013

```gherkin
Given a run in workspace A
When a client in workspace B listens for trace events
Then no events from workspace A's run are delivered to workspace B
```

## Edge cases

- Concurrent runs of the same workflow → each run has its own run id; trace views
  never interleave events across runs.
- Very large node outputs → trace truncates with an expand action rather than breaking
  layout.
- Node fails while an independent branch is still queued → the entire run stops
  (global fail-fast); no branch continues.

## Business rules

- Trace data is per-run and ephemeral; it is not stored with the workflow.
- Trace visibility is a deliberate policy: prompts and intermediate outputs are
  visible to the run owner (pedagogically useful for the workshop); credentials,
  headers, and provider account identifiers are never visible to anyone.

## Constraints

- Events must be transport-compatible with the existing event delivery mechanism.

## Dependencies

- SPEC-0004 (events scoped to the acting workspace).

## Assumptions

- `nodeExecutionChanged` replaces the legacy node lifecycle events after frontend
  consumers migrate.

## Open questions

- None currently.

## Success criteria

- During the guided demo, participants can observe each step's intermediate output as
  the facilitator builds the workflow, and a hanging LLM request can never leave the
  UI indefinitely in a running state.

## Change history

| Date       | Change                                                                                                                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-15 | Initial specification created                                                                                                                                                                                                                                                                                   |
| 2026-09-15 | Fail-fast decision: global fail-fast (FR-008, AC-006); edge case updated                                                                                                                                                                                                                                        |
| 2026-09-15 | Added run correlation ids (FR-009, AC-007), run states incl. skipped/cancelled (FR-010), execution timeout (FR-011, AC-008), cancellation (FR-012, AC-009), trace delivery scoped to run owner (FR-013, AC-010), sanitized provider errors (FR-014); trace visibility made an explicit policy in business rules |
| 2026-09-15 | Review revision 2: run states and node-execution states separated — RunState = queued                                                                                                                                                                                                                           | running | completed | failed | cancelled (FR-010), NodeExecutionState adds skipped (FR-010a); cancellation marks not-started nodes cancelled; fail-fast clarified for in-flight parallel nodes: stop starting new nodes, cancel in-flight where possible, disregard late results (FR-008, AC-009a) |
| 2026-09-16 | Implemented ephemeral owner-scoped run correlation, lifecycle execution, cancellation, timeout, output redaction and truncation, Test/Trace UI, and trace-to-canvas selection.                                                                                                                                  |
