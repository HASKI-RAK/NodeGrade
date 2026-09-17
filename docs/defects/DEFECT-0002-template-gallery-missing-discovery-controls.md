---
id: DEFECT-0002
title: Template gallery omits category, type filtering, and structural preview
status: open
severity: medium
area: templates
specs:
  - SPEC-0003/AC-007
found: 2026-09-17
---

# Template gallery omits category, type filtering, and structural preview

## Environment

- Commit: `e9cd841`
- Stack: `yarn debug:up`
- Browser: Chromium through Playwright MCP
- Route: `/templates`
- Viewport: 1440 x 900

## Preconditions

- Bundled workflow and block templates are seeded.

## Steps to reproduce

1. Open `/templates`.
2. Inspect the gallery controls and each template card.
3. Select each available card and action.

## Expected result

Each card shows name, description, and category. A type control filters workflow and block templates. Selecting a template opens a structural preview before use.

## Actual result

Each card shows a name, description, and `Use template` action. Category metadata, a type filter, and a structural preview are absent.

The gallery combines the `Feedback generator` block with workflow templates in one unfiltered list.

## Evidence

Observed entries:

- Feedback generator
- Demo workflow
- WAIE free-text assessment
- Debug workflow

The accessibility tree contains four `Use template` buttons. Filter and preview controls are absent.

## Impact

Participants and facilitators lack template-kind distinction and graph inspection before workflow creation.

## Acceptance check

Add visible category metadata, a workflow/block type filter, and a structural preview. Cover the combined seeded gallery with a Playwright assertion matching SPEC-0003/AC-007.
