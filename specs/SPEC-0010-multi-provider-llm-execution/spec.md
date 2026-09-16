---
id: SPEC-0010
type: feature
title: Multi-provider LLM execution
status: implemented
parent: SPEC-0009
priority: P1
created: 2026-09-15
updated: 2026-09-16
depends_on:
  - SPEC-0011
related:
  - SPEC-0012
---

# Multi-provider LLM execution

## Intent

### Problem

The LLM node routes execution between a local model worker and OpenAI using
hardcoded endpoints and env-var-driven branching. Adding a provider (e.g. OpenRouter)
requires new node code paths, and provider selection is invisible to administrators.

### Desired outcome

The LLM node executes against any configured provider — local model worker, OpenAI,
OpenRouter — selected by a composite provider+model reference from persisted
configuration. Provider integration is built on the Vercel AI SDK, so OpenAI-compatible
providers are added by configuration, not new node logic.

## Scope

### In scope

- Provider abstraction for LLM execution covering the local model worker, OpenAI,
  OpenRouter, and OpenAI-compatible providers (arbitrary configured base URL +
  credentials), implemented on the Vercel AI SDK.
- Model listing aggregated from all enabled providers, each model tagged with its
  source provider.
- Composite model identity: workflows serialize provider id + model id, not a bare
  model id.
- Model capability metadata (supported parameters, context limits) with defined
  behavior for unsupported configured parameters.
- Execution routing: a selected model is executed against its provider.
- OpenRouter integration via its OpenAI-compatible interface through the AI SDK.
- OpenAI-compatible provider type: any endpoint exposing an OpenAI-compatible chat
  completion interface can be added by configuration (base URL, credentials, display
  name) without code changes.

### Out of scope

- Admin UI and persistence of provider configuration (SPEC-0011).
- Allowlist filtering of models (SPEC-0012).
- Streaming responses.
- Non-OpenAI-compatible provider protocols.

## Actors

- End user: selects a model in the LLM node and executes it.
- Facilitator (admin): indirectly, by configuring providers (SPEC-0011).

## User scenarios

### US-001 — Use an OpenRouter model

As an end user,
I want to select an OpenRouter-hosted model in the LLM node and run my workflow,
so that I can use the models my organization provides without needing my own API key.

Priority: P1

Independent value: unlocks a large model catalog for users without any per-user
credentials.

### US-002 — Mixed providers in one workflow

As an expert user,
I want model lists from the local worker and cloud providers merged in one model
selector,
so that I can pick the best model per node regardless of where it is hosted.

Priority: P2

Independent value: removes artificial separation between local and cloud models.

## Functional requirements

### FR-001 — Provider abstraction on the Vercel AI SDK

The LLM node SHALL execute chat completions through a provider abstraction built on
the Vercel AI SDK, in which each provider is identified by a provider id and supplies
a model list and a completion endpoint.

### FR-002 — OpenRouter provider

WHEN OpenRouter is configured and enabled,
the system SHALL list OpenRouter models and execute chat completions against the
OpenRouter API using the configured server-side key.

### FR-002a — OpenAI-compatible provider type

WHERE a provider of type OPENAI_COMPATIBLE is configured with a base URL, credentials,
and a display name and is enabled,
the system SHALL list its models and execute chat completions against the configured
base URL without any code changes to the execution logic.

### FR-003 — Existing providers preserved

WHEN the local model worker or OpenAI is configured,
the system SHALL continue to list and execute their models with behavior equivalent
to the current implementation.

### FR-004 — Composite model identity

WHEN a user selects a model,
the system SHALL serialize the selection as a composite reference (provider id +
model id) in the workflow, and SHALL route execution to exactly that provider.

### FR-005 — Duplicate model ids remain distinct

IF the same model id is offered by more than one enabled provider,
THEN the system SHALL present them as distinct selectable entries (e.g. "model-x ·
OpenAI" and "model-x · OpenRouter"), each executing against its own provider.

### FR-006 — Model list aggregation

WHEN the LLM node initializes,
the system SHALL merge model lists from all enabled providers into one selectable
list, with each entry carrying its provider id.

### FR-007 — Provider failure isolation

IF one enabled provider fails to return its model list or to execute a completion,
THEN the system SHALL surface the failure for models of that provider only and SHALL
NOT prevent listing or execution of models from other providers.

### FR-008 — Credential isolation

The LLM node SHALL send provider credentials only in requests to the corresponding
provider and SHALL NOT expose them in serialized graph data, client-visible model
lists, or error messages.

### FR-009 — Model capability metadata

The system SHALL associate each model with capability metadata (supported parameters,
context limit where known) and SHALL make it available to the editor UI.

### FR-010 — Unsupported parameter handling

IF a node's configured parameter is not supported by the selected model,
THEN the system SHALL apply the documented rule: the parameter SHALL be disabled in
the UI where capability is known, and SHALL be ignored at execution with the
ignoring recorded in the trace.

### FR-011 — Legacy model reference migration

WHEN an existing workflow contains a bare model id without a provider reference,
the system SHALL resolve it exactly once against the configured providers and persist
the resolved composite reference.

### FR-012 — Ambiguous legacy migration requires explicit selection

IF more than one enabled provider exposes a legacy bare model id,
THEN the system SHALL NOT guess a provider; the node SHALL be marked as requiring
model selection and SHALL NOT execute until the user selects a concrete provider+model
entry.

## Non-functional requirements

### NFR-001 — Provider addition without node changes

Adding an additional provider of type OPENAI_COMPATIBLE SHALL require only
configuration changes; no changes to LLM node execution logic.

## Acceptance criteria

### AC-001 — OpenRouter model executes

Traces to: FR-002, FR-004

```gherkin
Given OpenRouter is configured with a valid server-side key and enabled
When a user selects an OpenRouter model in the LLM node and executes the node
Then the completion is returned from OpenRouter using the configured key
And the key is not present in any client-visible data
```

### AC-002 — Merged model list

Traces to: FR-006

```gherkin
Given the local model worker and OpenRouter are both enabled
When the LLM node initializes
Then the model selector contains models from both providers
And each model entry is associated with its provider
```

### AC-003 — Routing follows provider

Traces to: FR-004

```gherkin
Given models from multiple providers are listed
When the user selects a model from provider A and executes the node
Then the completion request is sent only to provider A
```

### AC-004 — Duplicate model ids stay selectable

Traces to: FR-005

```gherkin
Given two enabled providers both offer model id "m"
When the LLM node lists models
Then both "m · provider A" and "m · provider B" are selectable
And selecting each executes against the corresponding provider
```

### AC-005 — One provider down does not break others

Traces to: FR-007

```gherkin
Given the local worker and OpenRouter are enabled and OpenRouter is unreachable
When the LLM node initializes and the user executes a local-worker model
Then the local model executes successfully
And selecting an OpenRouter model reports a provider-specific failure
```

### AC-006 — Legacy behavior preserved

Traces to: FR-003

```gherkin
Given only the local model worker is configured (no cloud providers)
When a user selects a local model and executes the node
Then behavior matches the current local-worker execution path
```

### AC-007 — Provider change does not silently reroute

Traces to: FR-004, FR-005

```gherkin
Given a workflow referencing "m · provider A"
When provider B is enabled or provider configuration changes
Then the workflow still executes "m" against provider A
```

### AC-008 — Unsupported parameter disabled or ignored

Traces to: FR-009, FR-010

```gherkin
Given a model that does not support top-k
When the user selects that model in the LLM node
Then the top-k control is disabled in the UI where capability is known
And if configured anyway, the parameter is ignored at execution and the ignoring is recorded in the trace
```

### AC-009 — Legacy bare model id migrated

Traces to: FR-011

```gherkin
Given an existing workflow with a bare model id "m" offered by exactly one enabled provider
When the workflow is loaded after the composite-reference migration
Then the reference is resolved to that provider's composite provider+model reference and persisted
```

### AC-009a — Ambiguous legacy reference not guessed

Traces to: FR-012

```gherkin
Given an existing workflow with a bare model id "m" offered by two enabled providers
When the workflow is loaded after the composite-reference migration
Then the node is marked as requiring model selection and does not execute
And the user resolves it by selecting one of the offered provider+model entries
```

### AC-009b — OpenAI-compatible provider added by configuration

Traces to: FR-002a, NFR-001

```gherkin
Given a facilitator has configured a provider of type OPENAI_COMPATIBLE with a base URL and credentials
When the provider is enabled
Then its models appear in user model lists and execute against the configured base URL
And no LLM node execution logic was changed
```

## Edge cases

- Provider key invalid or expired → provider marked failed; its models hidden or
  flagged, other providers unaffected.
- Provider returns a model list in an unexpected format → provider contributes no
  models rather than breaking aggregation.
- Model selected earlier is removed from the provider catalog → node reports the
  model as unavailable on next execution instead of sending a doomed request.

## Business rules

- A model id SHALL map to exactly one provider at execution time.

## Constraints

- Provider integration SHALL be built on the Vercel AI SDK.
- OpenRouter SHALL be accessed through its OpenAI-compatible interface via the AI SDK.
- Provider credentials SHALL be supplied from server-side persisted configuration
  (SPEC-0011), replacing direct env-var reads in the LLM node.

## Dependencies

- SPEC-0011 (provider configuration source).

## Assumptions

- OpenRouter's model catalog is large; no pagination requirement beyond what the
  catalog API provides.
- The Vercel AI SDK covers the local model worker via an OpenAI-compatible custom
  provider; if the local worker requires a protocol the AI SDK cannot express, it
  remains a special-cased provider behind the same abstraction.

## Open questions

- None currently.

## Success criteria

- An OpenRouter model can be selected and executed in a workshop workflow without
  any per-user setup.
- Existing local-worker and OpenAI workflows continue to run unchanged.
- Changing provider priority never silently reroutes an existing workflow to a
  different provider; ambiguous legacy references are never guessed (FR-012).

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created |
| 2026-09-15 | Review revision: OPENAI_COMPATIBLE provider type defined (FR-002a, AC-009b, NFR-001) — resolves the contradiction with SPEC-0011's fixed provider set; legacy migration no longer uses provider priority: unique match migrates automatically, ambiguous match requires explicit model selection (FR-012, AC-009a) |
