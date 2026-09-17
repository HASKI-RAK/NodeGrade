---
id: DEFECT-0001
title: Published WAIE workshop starts with unconfigured model nodes
status: resolved
severity: critical
area: workshop-execution
specs:
  - SPEC-0007/AC-002
  - SPEC-0007/AC-007
  - SPEC-0007/AC-008
found: 2026-09-17
fixed: 2026-09-17
---

# Published WAIE workshop starts with unconfigured model nodes

## Environment

- Commit: `e9cd841`
- Stack: `yarn debug:up`
- Browser: Chromium through Playwright MCP
- Workshop: `WAIE-2026`
- Viewport: 1440 x 900

## Preconditions

- The seeded `WAIE-2026` workshop is published.
- `Local model worker` is enabled with `ALLOW_ALL` policy.
- Facilitator readiness reports Pass for backend, template, node types, and provider models.

## Steps to reproduce

1. Open `/workshop/WAIE-2026` in a fresh browser context.
2. Wait for the participant editor to open.
3. Open Preview.
4. Enter an answer longer than the configured 20-character minimum.
5. Select Run assessment.

## Expected result

The canonical WAIE workflow completes and displays score, classification, and feedback. Readiness identifies any configuration that prevents this run.

## Actual result

The run ends with `Run: failed`. `Assessment model` reports `Node execution failed.` and downstream nodes become skipped.

All three LLM nodes contain the following initial model state:

```json
{
  "model": "",
  "model_ref": null,
  "needs_model_selection": true
}
```

Facilitator readiness still reports Pass, including `Provider models: 1 model(s) available from Local model worker.`

## Evidence

- Failure reproduced from the participant deep link and from a fresh workflow created through the WAIE template gallery entry.
- Trace contains 24 steps; the first LLM node fails and dependent steps become skipped.
- Assigning `local / nodegrade-deterministic` to nodes 8, 15, and 23 makes the same participant workflow complete.
- The successful run displays `Score: 100`, a classification, and feedback.

## Impact

The published conference workflow passes facilitator readiness and then fails during the participant's primary assessment action.

## Acceptance check

1. Seed or publish a WAIE revision whose three LLM nodes use an allowed provider-qualified model reference.
2. Extend readiness to validate model references used by every LLM node in the selected template revision.
3. Join the published workshop from a fresh browser context and complete an assessment using the seeded configuration.

## Resolution

- Configured all canonical WAIE LLM nodes with `openrouter/openrouter/free`.
- Extended workshop readiness to reject unconfigured and unavailable template model references.
- Kept browser tests deterministic through a debug-only mapping to `local/nodegrade-deterministic`.

## Verification

- `yarn test`: 300 backend tests and 59 frontend tests passed.
- `yarn test:e2e`: 18 Chromium and Firefox tests passed.
- `yarn typecheck`, `yarn lint:check`, `yarn test:specs`, and `yarn build` passed.
