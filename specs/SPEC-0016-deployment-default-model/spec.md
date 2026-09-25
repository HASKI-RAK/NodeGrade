---
id: SPEC-0016
type: feature
title: Deployment default model
status: implemented
parent: SPEC-0009
priority: P1
created: 2026-09-22
updated: 2026-09-22
depends_on:
  - SPEC-0010
  - SPEC-0011
  - SPEC-0012
related: []
---

# Deployment default model

## Intent

### Problem

Every LLM node needs an explicitly selected provider and model before it runs.
Facilitators preparing a workshop must pin the same model on every node of every
template, and participants opening an ad-hoc workflow face a "select a model"
failure until they pick one — even though the deployment has exactly one model
the facilitator wants everyone to use. The deterministic local model worker fills
that gap today, but it is a debug stand-in that participants should never see in
production.

### Desired outcome

The facilitator sets one deployment-wide default model in the admin UI. Every
model node without an explicit selection runs against that default, stored
workflow content stays untouched, and the local worker disappears from the
participant surface in production while remaining manageable by the facilitator.

## Scope

### In scope

- Facilitator-owned deployment default model (set, change, clear) in the admin
  UI, restricted to enabled providers and policy-permitted models.
- Execution fallback: model nodes without an explicit `model_ref` run against
  the default; stored graphs are never rewritten with it.
- Participant catalog (`GET /api/models`) exposes the effective default alongside
  the model and provider lists.
- Workshop readiness passes unconfigured model nodes when the default covers
  them.
- Production hiding of the local model worker from the participant catalog and
  from execution.

### Out of scope

- Per-workspace, per-template, or per-user defaults.
- Automatic migration of stored workflows onto the default.
- Friendly display names per model (open question carried over from SPEC-0012).

## Actors

- Facilitator (admin): sets the deployment default model.
- Participant: runs workflows; unconfigured model nodes silently use the default.

## User scenarios

### US-001 — Run a workshop without per-node model pinning

As a facilitator,
I want to set one default model for the deployment,
so that templates and ad-hoc workflows run without selecting a model on every
LLM node.

Priority: P1

Independent value: workshop preparation stops being per-node configuration work.

### US-002 — Keep the debug worker out of production

As a facilitator,
I want the deterministic local model worker hidden from participants in
production,
so that no participant run can reach a debug stand-in, while I can still manage
the worker itself.

Priority: P1

Independent value: production runs always reach a real, governed model.

## Functional requirements

### FR-001 — Default model setting

The system SHALL let the facilitator set the deployment default to one
provider-qualified model and SHALL let the facilitator clear it, in which case
every model node needs its own selection again.

### FR-002 — Default validation

WHEN the facilitator saves a default model,
the system SHALL require provider and model together or neither, and SHALL
reject a default whose provider does not exist, is disabled, or whose policy
excludes the model.

### FR-003 — Execution fallback without persisting

WHEN a workflow executes and an LLM node carries no explicit model selection,
the system SHALL execute that node against the deployment default if one is
effective, and SHALL NOT write the default into the stored workflow content.

### FR-004 — Catalog exposes the effective default

WHEN a participant lists models,
the system SHALL include the deployment default in the response, but only when
that default is runnable (its provider is enabled, its policy permits it, and it
is present in the offered catalog); otherwise the response SHALL carry no
default.

### FR-005 — Readiness honours the default

WHEN a workshop template holds model nodes without an explicit selection,
the readiness check SHALL pass those nodes when the effective default covers
them and SHALL fail them otherwise.

### FR-006 — Local worker hidden in production

WHILE the deployment runs in production,
the system SHALL exclude the local model worker from the participant model and
provider lists and SHALL reject executions targeting it, while the facilitator's
per-provider views SHALL keep showing it.

### FR-007 — Default applies without redeployment

WHEN the facilitator saves or clears the default,
the system SHALL apply it to subsequent listings, readiness checks, and
executions without server restart.

## Non-functional requirements

### NFR-001 — Enforcement completeness

The production hiding of the local worker SHALL be enforced server-side;
client-side filtering alone SHALL NOT be relied upon.

Verification: server-side tests asserting that the participant catalog omits the
local worker in production and that execution targeting it is rejected even with
an explicit reference.

## Acceptance criteria

### AC-001 — Facilitator sets a default

Traces to: FR-001

```gherkin
Given OpenAI is enabled and permits "gpt-5"
When the facilitator saves "openai/gpt-5" as the deployment default
Then the setting is persisted and reported as the current default
```

### AC-002 — Clearing restores per-node selection

Traces to: FR-001

```gherkin
Given a deployment default is set
When the facilitator clears it
Then model nodes without an explicit selection fail with "select a model" again
```

### AC-003 — Invalid defaults are rejected

Traces to: FR-002

```gherkin
Given a provider that is disabled or whose policy excludes "gpt-5"
When the facilitator saves that provider and model as the default
Then the save is rejected with an error naming the problem
And a half-set default (provider without model, or model without provider) is
rejected as well
```

### AC-004 — Unconfigured nodes run against the default

Traces to: FR-003

```gherkin
Given the deployment default is "openai/gpt-5"
When a workflow with an LLM node carrying no model selection executes
Then the node runs against "openai/gpt-5"
And the stored workflow still carries no model selection afterwards
```

### AC-005 — Participants see the effective default

Traces to: FR-004

```gherkin
Given the stored default is offered in the participant catalog
When a participant lists models
Then the response names the default alongside the models
Given the stored default vanishes from the catalog (or its provider is
disabled)
When a participant lists models
Then the response carries no default
```

### AC-006 — Readiness passes defaulted templates

Traces to: FR-005

```gherkin
Given a template whose LLM nodes carry no model selection
And the deployment default is available in the participant catalog
When readiness is evaluated
Then the models check passes and names the default
Given no usable default is set
When readiness is evaluated
Then the models check fails naming the unconfigured nodes
```

### AC-007 — Production hides the local worker end to end

Traces to: FR-006

```gherkin
Given the deployment runs in production with the local worker enabled
When a participant lists models
Then neither the model list nor the provider list mentions the local worker
When a run requests the local worker explicitly
Then execution is rejected with the model unavailable
```

### AC-008 — Default change is immediate

Traces to: FR-007

```gherkin
Given participants have model lists open
When the facilitator saves a new default
Then subsequent listings, readiness checks, and executions use it without
server restart
```

## Edge cases

- Stored default whose provider is later disabled or whose policy stops
  permitting it → reads as no default everywhere (catalog, execution,
  readiness); saving the setting again is rejected until fixed.
- Stored default pointing at the local worker in production → reads as no
  default for participants; the facilitator view is unaffected.
- Default saved while its provider is temporarily unreachable → save allowed
  (reachability is an execution/readiness concern, not a save-time one).

## Business rules

- The default model SHALL be deployment-global (one default for the whole
  instance).
- A default SHALL always be a provider-qualified `ModelRef`, never a bare model
  id.

## Constraints

- Default editing is restricted to the facilitator role (SPEC-0013) and lives in
  the provider administration UI (SPEC-0011).

## Dependencies

- SPEC-0010 (live provider catalog the default is validated against and exposed
  through, plus the execution routing the fallback feeds).
- SPEC-0011 (facilitator admin UI and access control hosting the default
  editor).
- SPEC-0012 (model policy governance the default must satisfy and the local
  worker's catalog/execution enforcement it extends into production hiding).

## Assumptions

- Deployments that need per-template model pinning keep setting explicit
  `model_ref` values; the default only covers nodes without one.

## Open questions

- None.

## Success criteria

- A facilitator sets one default and every workflow without explicit model
  selections runs against it, with stored content unchanged.
- In production, no participant surface offers or executes the local worker.

## Change history

| Date | Change |
|---|---|
| 2026-09-22 | Initial specification created and implemented: `DeploymentSettings` singleton with facilitator CRUD, execution-time substitution in `GraphHandlerService`, effective-default exposure in the participant catalog, readiness fallback, and production hiding of the local worker from catalog and execution. |
