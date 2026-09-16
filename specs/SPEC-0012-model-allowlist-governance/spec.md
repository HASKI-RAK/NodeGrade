---
id: SPEC-0012
type: feature
title: Model allowlist governance
status: implemented
parent: SPEC-0009
priority: P1
created: 2026-09-15
updated: 2026-09-17
depends_on:
  - SPEC-0011
  - SPEC-0010
related: []
---

# Model allowlist governance

## Intent

### Problem

Every model offered by an enabled provider is selectable by end users. When an
administrator configures OpenRouter with a shared key, users could pick any of
hundreds of models — including expensive or inappropriate ones — with no way to
restrict the choice.

### Desired outcome

The administrator defines, per provider, the subset of models users may select. The
LLM node offers only allowed models, and execution of disallowed models is rejected
server-side regardless of what the client requests.

## Scope

### In scope

- Per-provider model policy edited by the facilitator in the admin UI, with explicit
  policy modes: DENY_ALL, ALLOWLIST, ALLOW_ALL.
- Policy mode selection required when a cloud provider is first enabled.
- Allowlist selection from the provider's live model catalog.
- Enforcement on model listing (users see only allowed models).
- Enforcement on execution (disallowed models rejected server-side).
- Minimal concurrency guards protecting the shared key from saturation: per-workspace
  concurrent LLM execution limit and deployment-wide concurrent provider request
  limit (no billing or token accounting).

### Out of scope

- Per-user, per-workspace, or per-template model policies.
- Billing, token accounting, or cost budgets.
- Provider enable/disable and key management (SPEC-0011).

## Actors

- Facilitator (admin): defines the allowed model subset per provider.
- End user: sees and runs only allowed models.

## User scenarios

### US-001 — Restrict users to a curated model set

As a facilitator,
I want to pick a subset of OpenRouter models that users may use,
so that a shared key cannot be spent on unapproved or expensive models.

Priority: P1

Independent value: makes shared provider keys safe to expose to a large user group.

### US-002 — Allow everything deliberately

As a facilitator,
I want to set a provider's policy mode to ALLOW_ALL when I genuinely want every model
offered,
so that I am not forced to curate a catalog I do not care about — while the choice
remains explicit rather than a silent default.

Priority: P2

Independent value: keeps configuration effort proportional to governance needs
without an unsafe implicit default.

## Functional requirements

### FR-001 — Policy modes

The system SHALL support three explicit per-provider policy modes: DENY_ALL (no models
selectable), ALLOWLIST (only selected models selectable), and ALLOW_ALL (all catalog
models selectable).

### FR-002 — Mode selection on first enablement

WHEN a cloud provider is enabled for the first time,
the system SHALL require the facilitator to choose a policy mode before the provider
becomes usable by end users.

### FR-003 — Allowlist editing

WHEN a facilitator edits a provider's model policy in ALLOWLIST mode,
the system SHALL allow selecting allowed models from that provider's live model
catalog and SHALL persist the selection.

### FR-004 — Catalog browsing

WHEN a facilitator opens the model policy editor for an enabled provider,
the system SHALL show the provider's current model catalog with the allowed subset
marked.

### FR-005 — Listing enforcement

WHILE a provider's policy mode is ALLOWLIST,
the system SHALL include only allowlisted models of that provider in user-visible
model lists.

### FR-006 — DENY_ALL enforcement

WHILE a provider's policy mode is DENY_ALL,
the system SHALL offer no models of that provider to users and SHALL reject
executions targeting it.

### FR-007 — Execution enforcement

IF an LLM node execution requests a model that is not permitted by the provider's
policy mode,
THEN the system SHALL reject the execution with an error identifying the model as
unavailable.

### FR-008 — Allowlist survives catalog changes

IF a provider's catalog changes such that an allowlisted model id no longer exists,
THEN the system SHALL omit that model from user lists and SHALL keep the remaining
allowlist intact.

### FR-009 — Policy applies without redeployment

WHEN the facilitator saves a model policy,
the system SHALL apply it to subsequent model listings and executions without server
restart.

### FR-010 — Per-workspace concurrency guard

WHILE a workspace has reached the configured maximum of concurrent LLM executions,
the system SHALL reject additional LLM execution requests from that workspace with a
clear rate-limit error.

### FR-011 — Deployment-wide concurrency guard

WHILE the deployment has reached the configured maximum of concurrent provider
requests,
the system SHALL queue or reject additional provider requests with a clear
rate-limit error.

### FR-012 — Guard configuration

WHEN a facilitator configures the concurrency guards,
the system SHALL persist the limits and apply them without server restart.

## Non-functional requirements

### NFR-001 — Enforcement completeness

Model policy SHALL be enforced server-side; client-side filtering alone SHALL NOT be
relied upon for any enforcement requirement in this specification.

## Acceptance criteria

### AC-001 — Users see only allowed models

Traces to: FR-005

```gherkin
Given OpenRouter is enabled in ALLOWLIST mode with 5 models out of 200+
When a user opens the model selector in the LLM node
Then only those 5 OpenRouter models are offered
And models from other providers are unaffected
```

### AC-002 — Disallowed model rejected at execution

Traces to: FR-007

```gherkin
Given an ALLOWLIST policy excludes model "x"
When a workflow execution requests model "x" (e.g. from a crafted or stale client)
Then the execution is rejected with an error stating the model is unavailable
And no request is sent to the provider
```

### AC-003 — DENY_ALL blocks the provider

Traces to: FR-006

```gherkin
Given OpenRouter is enabled in DENY_ALL mode
When a user opens the model selector
Then no OpenRouter models are offered
And an execution targeting an OpenRouter model is rejected
```

### AC-004 — ALLOW_ALL offers everything

Traces to: FR-001

```gherkin
Given OpenRouter is enabled in ALLOW_ALL mode
When a user opens the model selector
Then all OpenRouter catalog models are offered
```

### AC-005 — Mode required on first enablement

Traces to: FR-002

```gherkin
Given a cloud provider is enabled for the first time with no policy mode chosen
When the facilitator saves the provider configuration
Then the save is rejected until a policy mode is selected
```

### AC-006 — Facilitator picks from live catalog

Traces to: FR-003, FR-004

```gherkin
Given the facilitator opens the model policy editor for OpenRouter in ALLOWLIST mode
When the facilitator views the catalog and selects a subset and saves
Then the selection is persisted and immediately reflected in user model lists
```

### AC-007 — Vanished catalog entry handled

Traces to: FR-008

```gherkin
Given model "x" is allowlisted and later removed from the provider catalog
When the LLM node lists models
Then "x" is not offered
And the rest of the allowlist remains in effect
```

### AC-008 — Policy change is immediate

Traces to: FR-009

```gherkin
Given users have model lists open
When the facilitator adds a model to the allowlist and saves
Then the model becomes selectable for subsequent listings without server restart
```

### AC-009 — Per-workspace concurrency limit enforced

Traces to: FR-010

```gherkin
Given the per-workspace concurrent LLM execution limit is 2
When a workspace issues 3 concurrent LLM executions
Then the first 2 execute
And the third is rejected with a rate-limit error
```

### AC-010 — Deployment-wide limit protects the shared key

Traces to: FR-011

```gherkin
Given the deployment-wide concurrent provider request limit is M
When concurrent requests across all workspaces exceed M
Then excess requests are queued or rejected with a rate-limit error
And no provider receives more than M concurrent requests
```

### AC-011 — Rapid repeated runs do not saturate the provider

Traces to: FR-010

```gherkin
Given a participant double-clicks Run repeatedly
When the workspace's concurrency limit is reached
Then excess runs are rejected with a rate-limit error instead of saturating the provider
```

## Edge cases

- Allowlist saved while provider catalog is temporarily unreachable → save allowed;
  catalog browsing shows cached or empty list with a notice; enforcement uses the
  persisted selection.
- Allowlist contains model ids from a different provider → those entries are ignored
  for this provider (allowlists are per provider).
- All allowlisted models of a provider vanish from the catalog → provider contributes
  no user-visible models; provider stays enabled.

## Business rules

- Model policy SHALL be deployment-global per provider (one policy per provider for
  the whole instance).
- A policy SHALL apply only to the provider it is defined for.
- There SHALL be no ambiguous "no policy record" state: every enabled cloud provider
  SHALL have exactly one explicit policy mode.
- Concurrency guard limits SHALL be deployment-global configuration, not per-user.

## Constraints

- Policy editing is restricted to the facilitator role (SPEC-0013) and lives in the
  provider configuration UI (SPEC-0011).

## Dependencies

- SPEC-0011 (admin UI, persistence, facilitator access).
- SPEC-0010 (live provider catalog and server-side execution routing that policy
  enforcement attaches to).

## Assumptions

- Provider catalogs are fetchable at policy-editing time; offline curation (typing
  model ids manually) is not required.
- Default concurrency limits are set conservatively for a 20–50 participant workshop;
  exact defaults are an implementation decision.

## Open questions

- Should the facilitator also be able to set a friendly display name per allowed
  model (e.g. "Fast draft" for a long OpenRouter id)?

## Success criteria

- With OpenRouter configured under a shared key, users can only select and run the
  administrator-approved subset of models, enforced server-side — and a newly enabled
  cloud provider can never default to unrestricted access.
- Repeated or concurrent runs cannot saturate the shared provider key.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created |
| 2026-09-15 | Unsafe default-allow replaced with explicit policy modes DENY_ALL | ALLOWLIST | ALLOW_ALL (FR-001), mode selection required on first cloud-provider enablement (FR-002, AC-005), per-mode enforcement (FR-005..FR-007, AC-003/004). Dependency cycle fixed: depends on SPEC-0011 only. |
| 2026-09-15 | Added minimal concurrency guards protecting the shared key: per-workspace concurrent LLM execution limit (FR-010, AC-009/011) and deployment-wide concurrent provider request limit (FR-011, AC-010), facilitator-configurable (FR-012). Billing/token accounting remain out of scope. |
| 2026-09-15 | Review revision: SPEC-0010 added to depends_on and Dependencies — policy enforcement needs the live catalog and execution routing from 0010; dependency chain is now 0013 → 0011 → 0010 → 0012 |
| 2026-09-17 | Implemented. `ModelPolicy.mode` became nullable so "not yet chosen" is distinct from DENY_ALL; enforcement lives in `ProviderRuntimeService` (catalog filter and pre-flight check in `complete()`); concurrency guards added as the `ExecutionLimits` singleton with a per-workspace run cap in `GraphHandlerService` and a deployment-wide permit gate around provider requests. Open question on friendly display names left open — the catalog label is used as-is. |
