---
id: DEFECT-0003
title: Template-derived workflows lack a reset action
status: open
severity: high
area: templates
specs:
  - SPEC-0003/AC-002
  - SPEC-0003/AC-003
found: 2026-09-17
---

# Template-derived workflows lack a reset action

## Environment

- Commit: `e9cd841`
- Stack: `yarn debug:up`
- Browser: Chromium through Playwright MCP
- Workflow source: WAIE free-text assessment template
- Viewport: 1440 x 900

## Preconditions

- Create a workflow through `Use template` on the WAIE gallery card.

## Steps to reproduce

1. Edit the Question node through the inspector.
2. Open `More editor actions`.
3. Inspect the available workflow actions.

## Expected result

A reset action asks for confirmation and restores the workflow from its recorded source template revision.

## Actual result

The action menu contains:

- Save as…
- Import workflow…
- Export workflow
- Connection information
- Developer tools

A reset action and confirmation flow are absent from the editor.

## Evidence

The missing action was reproduced on two fresh WAIE-derived workflows. Frontend symbol search for `reset` returns workspace/store reset helpers; a template-revision reset UI is absent.

## Impact

Workshop participants lack the specified recovery path after graph edits. Facilitator guidance loses the reset-to-source workflow promised by SPEC-0003.

## Acceptance check

Expose Reset to source revision for template-derived workflows, show a destructive confirmation dialog, call the workflow reset endpoint, reload the restored graph, and preserve the source revision reference.
