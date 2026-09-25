---
id: SPEC-0001
type: epic
title: NodeGrade workshop readiness
status: draft
parent: null
priority: P0
created: 2026-09-15
updated: 2026-09-25
depends_on:
  - SPEC-0013
related:
  - SPEC-0002
  - SPEC-0003
  - SPEC-0004
  - SPEC-0005
  - SPEC-0006
  - SPEC-0007
  - SPEC-0008
  - SPEC-0009
  - SPEC-0013
  - SPEC-0014
  - SPEC-0022
---

# NodeGrade workshop readiness

## Intent

### Problem

NodeGrade is being presented at a workshop (WAIE tutorial) where participants watch a
guided workflow being built, then spend ~35 minutes adapting a preconfigured assessment
workflow. The current product is developer-oriented: the landing page is a placeholder,
graphs have no ownership, there is no template concept, the editor exposes low-level
mechanics, and intermediate execution results are invisible. This makes the promised
demo → inspect → modify → discuss journey impractical for 20–50 concurrent participants.

### Desired outcome

Participants can enter the workshop through a dedicated entry point, duplicate a
canonical assessment template into their own isolated workspace, adapt it using
high-level editing affordances (palette, inspector, insertable blocks), observe
node-by-node execution with intermediate outputs, and recover from mistakes — without
the facilitator having to explain NodeGrade's internals.

## Scope

### In scope

- Landing page and workshop entry routing (SPEC-0002)
- Template subsystem: workflow templates, insertable block templates, duplicate/reset
  semantics (SPEC-0003)
- Workspace/session isolation and multi-user storage (SPEC-0004)
- Editor shell redesign: toolbar, component palette, inspector, simplified nodes,
  sizing fix (SPEC-0005)
- Run/trace observability (SPEC-0006)
- Canonical WAIE workshop template and Test/Trace preview experience (SPEC-0007)
- Reliability hardening: CI gate, smoke test, error states, documentation (SPEC-0008)

### Out of scope

- General rewrite of the editor canvas engine
- LTI platform integration changes beyond workspace typing
- General end-user accounts/authentication (facilitator administrative
  authentication is explicitly in scope through SPEC-0013)
- Performance optimization beyond workshop-scale usage
- LLM provider management and model governance (SPEC-0009, separate epic)

## Actors

- Workshop facilitator: presents the tutorial, prepares and demonstrates workflows.
- Participant (anonymous): attends the workshop, duplicates a template, adapts a
  workflow in an ephemeral workspace. Not authenticated.
- Instructor (LTI context): uses NodeGrade inside a course via LTI launch.
- Expert user: builds workflows from primitives outside a workshop context.

## Child features

| ID | Feature | Status |
|---|---|---|
| SPEC-0002 | Landing page and workshop entry | Draft |
| SPEC-0003 | Template subsystem | Draft |
| SPEC-0004 | Workspace isolation and multi-user storage | Draft |
| SPEC-0005 | Editor shell and node UX | Draft |
| SPEC-0006 | Run and trace observability | Draft |
| SPEC-0007 | WAIE workshop experience and preview | Draft |
| SPEC-0008 | Reliability, CI and documentation | Draft |
| SPEC-0014 | Workshop entity and join flow | Draft |

Note: SPEC-0009 (LLM provider management and model governance) is a separate epic,
not a child of this one. SPEC-0013 (facilitator authentication) is shared by both
epics and remains a top-level feature; this epic depends on it rather than owning it.

## Cross-feature business rules

- A template SHALL never be edited in place; using a template always creates a
  user-owned copy (SPEC-0003).
- Every workflow SHALL belong to exactly one workspace; every workflow operation SHALL
  be scoped to the actor's workspace, authorized via workspace access tokens
  (SPEC-0004).
- Workflow identity SHALL NOT depend on the URL path of the editor route.
- Administrative actions SHALL require the facilitator session from SPEC-0013.

## Cross-feature constraints

- Requirements must be deliverable before the conference workshop; items prioritized
  P0 (SPEC-0004, SPEC-0003, SPEC-0014, SPEC-0002, SPEC-0005) form the foundational
  implementation tranche. Conference readiness additionally requires SPEC-0006,
  SPEC-0007, and SPEC-0008 (run/trace, WAIE workshop experience, CI-gated happy
  path), which are therefore treated as P0 for the conference milestone; the epic
  success criteria below are only met once all of them ship.

## Dependencies

- SPEC-0013 (facilitator authentication gates every administrative capability this
  epic requires).

## Assumptions

- The workshop scenario involves 20–50 concurrent anonymous participants.
- LTI-launched usage remains a supported workflow identity source during migration.
- Existing stored graphs can be migrated into a default/personal workspace.
- Participant workspaces are created only by a workshop join (SPEC-0022/FR-013); the
  former anonymous BROWSER-type workspaces are no longer issued, and legacy rows
  auto-delete after 60 days of inactivity (SPEC-0004/FR-009).
- Templates are persisted server-side entities; bundled templates are seed data
  (decided in SPEC-0003/FR-002).
- Facilitator role is established via env-configured admin username/password with a
  server-issued admin session (decided in SPEC-0013).
- Provider integration is built on the Vercel AI SDK (decided in SPEC-0010).

## Open questions

- None currently.

## Epic success criteria

- A facilitator can run the full tutorial flow (publish workshop → participants join
  by code → duplicate WAIE template revision → participants edit independently → run
  → inspect trace) with 20–50 concurrent participants without graph collisions or
  verbal setup instructions.
- The conference happy path is covered by an automated smoke test that gates PRs.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created from workshop-readiness analysis |
| 2026-09-15 | Noted SPEC-0009 (LLM provider management) as a separate epic outside this epic's scope |
| 2026-09-15 | Review revision: added SPEC-0013 (facilitator auth foundation) and SPEC-0014 (Workshop entity and join flow) as children; updated business rules (token-based workspace authorization, admin session), P0 set, and assumptions (seeded templates, 60-day inactivity retention, Vercel AI SDK) |
| 2026-09-15 | Review revision 2: SPEC-0013 removed from Child Features (shared foundation, parent null); epic depends_on SPEC-0013; out-of-scope wording narrowed to general end-user accounts; P0 group renamed to "foundational implementation tranche" with SPEC-0006/0007/0008 promoted to P0 for the conference milestone |
| 2026-09-25 | Assumption on BROWSER-type workspace retention amended for SPEC-0022: participant workspaces come only from a workshop join; legacy browser rows are only swept. |
