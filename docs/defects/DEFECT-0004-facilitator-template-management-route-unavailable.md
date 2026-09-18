---
id: DEFECT-0004
title: Facilitator template management browser route is absent
status: resolved
severity: high
area: template-administration
specs:
  - SPEC-0003/AC-009
  - SPEC-0003/AC-010
  - SPEC-0003/AC-014
  - SPEC-0003/AC-017
found: 2026-09-17
fixed: 2026-09-17
---

# Facilitator template management browser route is absent

## Environment

- Commit: `e9cd841`
- Stack: `yarn debug:up`
- Browser: Chromium through Playwright MCP
- Session: authenticated facilitator
- Viewport: 1440 x 900

## Preconditions

- Sign in through `/admin` with valid facilitator credentials.

## Steps to reproduce

1. Inspect the Administration navigation.
2. Open `/admin/templates` directly.

## Expected result

The facilitator can create template revisions, publish or unpublish templates, and delete templates according to immutable-revision rules.

## Actual result

Administration navigation exposes Workshops and Providers. `/admin/templates` renders `Page not found`.

## Evidence

The backend advertises admin template endpoints for listing, creation, revision creation, publication changes, and deletion. The authenticated browser UI ends at Workshops and Providers.

## Impact

Facilitators lack the product UI for the template lifecycle required to prepare workshop content.

## Acceptance check

Add an authenticated Templates administration route and navigation entry. Exercise create revision, publish, unpublish, and delete semantics through Playwright while confirming participant gallery visibility.

## Resolution

- Added authenticated `/admin/templates` routing and administration navigation.
- Added create, append-revision, publish, unpublish, and soft-delete controls.
- Added component and Playwright lifecycle coverage, including gallery visibility.

## Verification

- `yarn test`: 300 backend tests and 59 frontend tests passed.
- `yarn test:e2e`: 18 Chromium and Firefox tests passed.
- `yarn typecheck`, `yarn lint:check`, `yarn test:specs`, and `yarn build` passed.
