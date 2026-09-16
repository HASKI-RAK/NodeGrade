# AGENTS.md

Instructions for AI agents and contributors working in this repository.

Repository orientation lives in `CLAUDE.md` (task routing, commands, invariants),
`docs/module-map.md` (where things live) and `docs/architecture.md` (how it fits
together). Read those before searching the tree; this file covers git workflow.

<!-- rtk-instructions v2 -->
# Command output

Command output here is condensed to save tokens, keeping every signal and
dropping costly noise. Treat it as the complete result: run commands
normally, and batch related commands into one call to avoid extra turns.
Truncated results state their recovery path in their own output. Re-run a
command as `rtk proxy <cmd>` only when its result is unusable: empty when
output was clearly expected, contradicting its exit code, or garbled.
<!-- /rtk-instructions -->

## Branching & Workflow

All work **must** be done in a dedicated git worktree on a separate temporary branch. Never commit directly to `dev` or `main`.

### Workflow steps

1. **Create a worktree and temporary branch** from the latest `dev`:

   ```bash
   git fetch origin
   git worktree add ../NodeGrade-<task-name> -b agent/<task-name> origin/dev
   cd ../NodeGrade-<task-name>
   ```

   - Branch naming: `agent/<short-task-name>` (e.g. `agent/fix-lti-cookie`, `agent/add-benchmark-export`).
   - Install dependencies in the worktree before building or testing (`yarn install`).

2. **Do the work** in the worktree:
   - Follow the coding guidelines in `.github/copilot-instructions.md`.
   - Run the relevant tests (`yarn test`, `yarn test:e2e`) and make sure they pass before finishing.

3. **Merge into `dev`**:
   - Commit your changes on the temporary branch.
   - Merge the branch into `dev` (fast-forward or merge commit, keep history clean).
   - Push `dev` if you have permission to do so.

4. **Clean up** — after the branch is merged into `dev`, the agent **must** delete both the worktree and the temporary branch:

   ```bash
   git worktree remove ../NodeGrade-<task-name>
   git branch -d agent/<task-name>
   ```

   Never leave stale worktrees or branches behind.

## Branch model

| Branch | Purpose |
|---|---|
| `dev` | **Default integration branch.** All work is merged here. This is the branch we usually merge into. |
| `main` | Stable release branch. Updated from `dev` **only** by explicit human decision. |

### Rules for `main`

- `main` is **never** updated automatically by an agent.
- `dev` is merged into `main` only when:
  1. It does **not break** anything (build, tests, and runtime are verified to work), and
  2. It contains **a couple of new features** worth merging — not for every small change.
- The human maintainer decides **when** this happens. If you are an agent, do not initiate a `dev` → `main` merge yourself; ask the maintainer instead.
