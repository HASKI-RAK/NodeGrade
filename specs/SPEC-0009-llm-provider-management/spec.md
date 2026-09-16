---
id: SPEC-0009
type: epic
title: LLM provider management and model governance
status: implemented
parent: null
priority: P1
created: 2026-09-15
updated: 2026-09-17
depends_on:
  - SPEC-0013
related:
  - SPEC-0005
---

# LLM provider management and model governance

## Intent

### Problem

The LLM node currently hardcodes two execution paths: a local model worker and
OpenAI, with provider selection driven by server environment variables only. There is
no OpenRouter support, no way to change providers without redeploying, and no control
over which models end users may select. An operator cannot offer, for example,
OpenRouter with a shared key while restricting users to a curated subset of models.

### Desired outcome

Administrators configure LLM providers (including OpenRouter) and the set of models
users may use through an authenticated admin UI with server-side persistence. End
users see and execute only the allowed models; provider credentials never reach the
client.

## Scope

### In scope

- Multi-provider LLM execution in the LLM node, including OpenRouter (SPEC-0010).
- Facilitator-only admin UI for provider configuration with persisted storage
  (SPEC-0011).
- Admin-managed model allowlist enforced on model listing and execution (SPEC-0012).

### Out of scope

- Per-user or per-workspace model policies (deployment-global policy only).
- User account management beyond the existing env-credentialed facilitator role.
- Non-LLM node types (image, embedding, similarity nodes).
- Usage metering, quotas, or cost tracking (billing/token accounting; the minimal
  concurrency guards protecting the shared key are in scope via SPEC-0012).

## Actors

- Facilitator (admin): authenticated via the admin session from SPEC-0013; configures
  providers and the allowed model subset.
- End user (participant, instructor, expert user): selects and runs models in the LLM
  node; restricted to the allowed subset; never sees provider credentials.

## Child features

| ID | Feature | Status |
|---|---|---|
| SPEC-0010 | Multi-provider LLM execution | Implemented |
| SPEC-0011 | Provider configuration admin UI | Implemented |
| SPEC-0012 | Model allowlist governance | Implemented |

## Cross-feature business rules

- Provider credentials SHALL exist only server-side; they SHALL NOT be included in
  serialized graphs, model lists sent to clients, or admin UI responses in
  readable form, and SHALL be encrypted at rest (SPEC-0011/FR-010).
- Model policy SHALL be deployment-global: one provider configuration and one policy
  per provider for the whole NodeGrade instance.
- Every enabled cloud provider SHALL have exactly one explicit policy mode (DENY_ALL,
  ALLOWLIST, ALLOW_ALL); there SHALL be no default-allow state (see SPEC-0012).
- Concurrency guards (per-workspace and deployment-wide) SHALL protect the shared
  provider key from saturation (see SPEC-0012/FR-010..FR-012).

## Cross-feature constraints

- The facilitator role SHALL be the admin session established by SPEC-0013; no new
  account system is introduced.
- Provider integration SHALL be built on the Vercel AI SDK (SPEC-0010).
- OpenRouter SHALL be integrated through its OpenAI-compatible interface via the AI
  SDK; no new execution protocol is introduced for it.

## Dependencies

- SPEC-0013 (facilitator authentication and admin session).

## Assumptions

- A single facilitator (or small trusted group sharing the admin credentials)
  manages the deployment; no concurrent-editing conflicts need resolving.
- The local model worker remains a provider alongside cloud providers.

## Open questions

- None currently.

## Epic success criteria

- An administrator can enable OpenRouter with a configured key and restrict users to
  a chosen subset of OpenRouter models entirely through the UI, without redeployment.
- An end user executing an LLM node can only select and run allowed models; attempts
  to use disallowed models fail with a clear error.
- Provider keys are never observable by end users and are encrypted at rest.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created; classified as epic (provider execution, admin configuration UI, and allowlist governance are independently deliverable) |
| 2026-09-15 | Dependency re-pointed to SPEC-0013 (facilitator auth foundation). Default-allow rule replaced with explicit policy modes. Vercel AI SDK recorded as the provider integration constraint. Priorities set (P1). |
| 2026-09-15 | Concurrency guards protecting the shared key added to scope via SPEC-0012 (FR-010..FR-012); billing/token accounting remain out of scope. |
| 2026-09-17 | Closed: SPEC-0012 completes the last child feature, so every epic success criterion is met. |
