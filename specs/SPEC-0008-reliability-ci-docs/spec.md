---
id: SPEC-0008
type: feature
title: Reliability, CI and documentation
status: implemented
parent: SPEC-0001
priority: P1
created: 2026-09-15
updated: 2026-09-25
depends_on:
  - SPEC-0002
  - SPEC-0003
  - SPEC-0004
  - SPEC-0006
  - SPEC-0007
  - SPEC-0014
related:
  - SPEC-0022
---

# Reliability, CI and documentation

## Intent

### Problem

The root test pipeline only runs backend tests (frontend tests are excluded), the only
CI workflow runs a report on pushes to `main` without gating pull requests, and the
README has incomplete sections (Example Usage: TODO, Docker: TODO). Conference
readiness requires the exact demo flow to be protected by automation and documented.

### Desired outcome

A PR-gating CI pipeline covering both packages plus build, typecheck, lint, and a
browser smoke test of the conference happy path, and documentation enabling setup,
template authoring, and participant onboarding.

## Scope

### In scope

- PR CI pipeline: install, typecheck, lint, backend unit tests, frontend unit tests,
  build, browser smoke test.
- Browser smoke test covering the conference happy path.
- README completion: usage, deployment, workshop setup, template authoring,
  participant instructions.
- Root test script alignment so frontend tests are part of the default test run.

### Out of scope

- Load/performance testing infrastructure.
- Visual regression testing.
- Release/deployment automation beyond the documented checklist.

## Actors

- Contributor: needs PR feedback on all packages.
- Facilitator: needs setup and workshop documentation.
- Participant: needs concise instructions.

## User scenarios

### US-001 — Conference flow protected by CI

As a maintainer,
I want a smoke test that walks the conference happy path on every PR,
so that regressions in the demo flow cannot be merged unnoticed.

Priority: P1

Independent value: protects the single most valuable demonstration.

### US-002 — One command tests everything

As a contributor,
I want the root test command to include frontend and backend tests,
so that I cannot accidentally skip half the test suite.

Priority: P2

Independent value: removes a silent coverage gap.

## Functional requirements

### FR-001 — PR gating pipeline

WHEN a pull request is opened or updated,
CI SHALL run install, typecheck, lint, backend unit tests, frontend unit tests, build,
and the browser smoke test, and SHALL fail the check if any step fails.

### FR-002 — Conference happy path smoke test

The smoke test SHALL cover: opening the application root, entering the WAIE workshop
code, joining the workshop (whose single entry is copied and opened in the editor, per
SPEC-0022/FR-007), modifying the rubric, running an example, observing a result,
reloading, and finding the workflow still present.

### FR-003 — Root test script coverage

The root test command SHALL execute both backend and frontend unit tests.

### FR-004 — Documentation completeness

The README SHALL document: application usage, deployment, workshop setup, template
authoring, and participant instructions, replacing the current TODO sections.

### FR-005 — Browser coverage

The browser smoke test SHALL run in both Chrome and Firefox.

### FR-006 — Deterministic LLM execution in tests

The browser smoke test SHALL use a deterministic test provider (fake model returning
known score, classification, and feedback) and SHALL NOT call external LLM providers
such as OpenAI or OpenRouter.

### FR-007 — Workspace isolation E2E test

The E2E suite SHALL include a test verifying that two independent browser sessions
can each maintain a workflow with the same slug, modify their graphs independently,
and reload to see only their own changes.

### FR-008 — Branch protection enforcement

The integration branch SHALL have a branch protection rule or ruleset requiring the
CI workflow as a required status check, so that the "PRs SHALL NOT merge while CI
fails" business rule is enforced by the platform.

## Non-functional requirements

### NFR-001 — CI duration

The full PR pipeline SHALL complete within 15 minutes.

Verification: recorded duration of the PR pipeline on a representative pull request;
under 15 minutes.

## Acceptance criteria

### AC-001 — PR checks run

Traces to: FR-001

```gherkin
Given a pull request is opened
When CI completes
Then all steps (install, typecheck, lint, backend tests, frontend tests, build, smoke test) have run
And a failing step fails the overall check
```

### AC-002 — Smoke test covers happy path

Traces to: FR-002

```gherkin
Given the application is running
When the smoke test executes
Then it performs the full conference flow from landing page through workshop join and template copy, rubric edit, run, result, reload persistence
```

### AC-003 — Root test runs both packages

Traces to: FR-003

```gherkin
Given the repository is checked out
When the root test command runs
Then backend and frontend unit tests both execute
```

### AC-004 — README has no TODO sections

Traces to: FR-004

```gherkin
Given the README
When a reader looks for usage, deployment, workshop setup, template authoring, or participant instructions
Then each section contains complete guidance and no TODO placeholders remain
```

### AC-005 — Smoke test runs in both browsers

Traces to: FR-005

```gherkin
Given CI is running the PR pipeline
When the browser smoke test executes
Then it passes in Chrome and in Firefox
```

### AC-006 — Smoke test uses deterministic provider

Traces to: FR-006

```gherkin
Given the CI environment has no external LLM credentials
When the browser smoke test executes the assessment run
Then the run completes with the deterministic test provider's known result
And no external LLM provider is called
```

### AC-007 — Isolation verified end to end

Traces to: FR-007, SPEC-0004/FR-005

```gherkin
Given two independent browser sessions
When each joins the same workshop code, receiving a workflow under the same slug, and modifies its graph differently
Then each session reloads and sees only its own modifications
```

### AC-008 — Failing CI blocks merge

Traces to: FR-008

```gherkin
Given the integration branch has the CI workflow as a required status check
When a PR's CI check fails
Then the platform prevents merging the PR
```

## Edge cases

- Smoke test flakiness → retry policy defined in CI configuration, failures block
  merge regardless.

## Business rules

- PRs SHALL NOT merge while the CI check fails (enforced via branch protection,
  FR-008).
- The browser smoke test SHALL NOT depend on external LLM providers, network
  availability, or provider secrets.

## Constraints

- None.

## Dependencies

- SPEC-0002, SPEC-0003, SPEC-0004, SPEC-0006, SPEC-0007, SPEC-0014 (the smoke test walks
  flows those features define).

## Assumptions

- A headless browser environment is available in CI.
- The deterministic test provider is configurable per deployment (e.g. enabled in
  test/CI environments only).

## Open questions

- None currently.

## Success criteria

- The conference happy path is exercised automatically on every PR in both Chrome and
  Firefox without external dependencies, workspace isolation is verified end to end,
  and the README enables a newcomer to set up and run a workshop without oral
  handover.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created |
| 2026-09-15 | Added deterministic test provider for E2E (FR-006, AC-006), workspace isolation E2E (FR-007, AC-007), branch protection requirement (FR-008, AC-008). FR ordering corrected. Dependencies extended with SPEC-0014. |
| 2026-09-15 | Review revision 2: frontmatter depends_on aligned with prose Dependencies (added SPEC-0006 and SPEC-0014) |
| 2026-09-17 | Implemented. AC-007 no longer names a literal slug: the slug under test is whatever joining a workshop derives from the template revision name, and the requirement is that two workspaces may hold the same one. |
| 2026-09-25 | FR-002/AC-002 reworded for SPEC-0022: the smoke test enters by workshop code and the join copies the workshop's single entry; no gallery or separate duplication step. |
