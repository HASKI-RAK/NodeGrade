# Plans

Future-facing refactoring and expansion plans. Each file is a self-contained,
actionable plan that can be picked up in a later wave.

| Plan | Status | Scope |
|---|---|---|
| [Architecture deepening (2026-09-18)](2026-09-18-architecture-deepening.md) | Proposed, not started | 6 deepening opportunities across backend run path, workspace resolution, provider runtime, template content, editor sync, and lib seam |

Conventions for new plans:

- One file per plan, named `YYYY-MM-DD-<short-name>.md`.
- State the source revision (`origin/dev` commit) and verification commands.
- Use the architecture glossary exactly: module, interface, seam, adapter, depth, leverage, locality.
- Record ADR conflicts inline; do not re-litigate accepted ADRs without cause.
