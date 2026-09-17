---
id: DEFECT-0005
title: Inspector covers the node palette at tablet width
status: open
severity: medium
area: editor-shell
specs:
  - SPEC-0005/AC-003
  - SPEC-0005/AC-006
found: 2026-09-17
---

# Inspector covers the node palette at tablet width

## Environment

- Commit: `e9cd841`
- Stack: `yarn debug:up`
- Browser: Chromium through Playwright MCP
- Viewport: 780 x 493
- Workflow: WAIE free-text assessment

## Preconditions

- Open a workflow in the editor at 780 x 493.
- Leave the Inspector details panel open.

## Steps to reproduce

1. Select Add in the editor toolbar.
2. Search for `Question` in the node palette.
3. Select the Question result.

## Expected result

The Add action presents an interactive node palette and the selected node is added to the canvas.

## Actual result

The Inspector expands across the content area and remains above the node palette. The palette exists behind it. The Question click fails because `Editor details` intercepts pointer events.

Playwright reports:

```text
<div aria-label="Editor details">…</div> intercepts pointer events
```

Closing Inspector reveals the palette. Resizing to 1440 x 900 also restores side-by-side interaction.

## Impact

Tablet-sized workshop displays make the primary Add workflow appear inactive and prevent direct palette interaction until the user discovers the Inspector close control.

## Acceptance check

At compact breakpoints, opening Add should replace or close the active details drawer. Add a Playwright viewport case that searches for a node and inserts it at 780 x 493.
