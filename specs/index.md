# Specification index

## Dependency-ordered implementation plan

Implementation follows dependency gates. Specification numbering remains an
identifier.
Specs within the same wave may proceed in parallel when their listed
dependencies have met their acceptance criteria. An implemented spec remains in
its dependency slot and acts as a completed gate. Earlier draft dependencies of
an implemented spec receive an acceptance review before the downstream feature
is included in a release.

| Wave                         | Specifications                  | Dependency gate                                                                                                                | Completion outcome                                                                                                                             |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Foundations              | SPEC-0004, SPEC-0013            | Both features are dependency roots.                                                                                            | Workspace isolation and facilitator authentication contracts are accepted.                                                                     |
| 2 — Core capabilities        | SPEC-0003, SPEC-0006, SPEC-0011 | SPEC-0003 follows SPEC-0004 and SPEC-0013. SPEC-0006 follows SPEC-0004. SPEC-0011 follows SPEC-0013.                           | Templates, workspace-scoped traces, and authenticated provider administration are available.  |
| 3 — Composition              | SPEC-0005, SPEC-0010, SPEC-0014 | SPEC-0005 follows SPEC-0003 and SPEC-0004. SPEC-0010 follows SPEC-0011. SPEC-0014 follows SPEC-0003, SPEC-0004, and SPEC-0013. | The editor, provider runtime, and workshop join domain compose the foundational capabilities. |
| 4 — Entry and policy         | SPEC-0002, SPEC-0012            | SPEC-0002 follows SPEC-0004 and SPEC-0014. SPEC-0012 follows SPEC-0010 and SPEC-0011.                                          | Participants can enter workshops and facilitators can govern the models exposed to them.          |
| 5 — Workshop experience      | SPEC-0007                       | SPEC-0003, SPEC-0004, SPEC-0006, SPEC-0010, SPEC-0012, and SPEC-0014 are accepted.                                             | The canonical WAIE flow supports editing, preflight validation, execution, and preview.                                                        |
| 6 — Release confidence       | SPEC-0008                       | SPEC-0002, SPEC-0003, SPEC-0004, SPEC-0006, SPEC-0007, and SPEC-0014 are accepted.                                             | CI, deterministic browser coverage, documentation, and the conference happy path form the release gate.                                        |
| 7 — Specification governance | SPEC-0015                       | The SPEC-0008 CI pipeline is available for the linting gate.                                                                   | Specification validation runs locally and in CI.                                                                                               |

Waves 1 to 4 are implemented; waves 5 to 7 have not started. The Status column of
the specification table below is authoritative and must match each
specification's frontmatter `status`.

SPEC-0009 closes after SPEC-0010, SPEC-0011, and SPEC-0012 satisfy the epic's
success criteria. SPEC-0001 closes after its child features (SPEC-0002 through
SPEC-0008 and SPEC-0014) satisfy the workshop-readiness success criteria and
the required provider-management capabilities from SPEC-0009 are available.

SPEC-0015's Dependencies section names SPEC-0008. Its frontmatter currently
declares `depends_on: []`. This plan uses the explicit prose dependency; align
the frontmatter when SPEC-0015 implementation begins.

| ID        | Type    | Title                                                | Parent    | Status      |
| --------- | ------- | ---------------------------------------------------- | --------- | ----------- |
| SPEC-0001 | Epic    | NodeGrade workshop readiness                         | null      | Draft       |
| SPEC-0002 | Feature | Landing page and workshop entry                      | SPEC-0001 | Implemented |
| SPEC-0003 | Feature | Template subsystem                                   | SPEC-0001 | Implemented |
| SPEC-0004 | Feature | Workspace isolation and multi-user storage           | SPEC-0001 | Implemented |
| SPEC-0005 | Feature | Editor shell and node UX                             | SPEC-0001 | Implemented |
| SPEC-0006 | Feature | Run and trace observability                          | SPEC-0001 | Implemented |
| SPEC-0007 | Feature | WAIE workshop experience and preview                 | SPEC-0001 | Draft       |
| SPEC-0008 | Feature | Reliability, CI and documentation                    | SPEC-0001 | Deferred    |
| SPEC-0009 | Epic    | LLM provider management and model governance         | null      | Implemented |
| SPEC-0010 | Feature | Multi-provider LLM execution                         | SPEC-0009 | Implemented |
| SPEC-0011 | Feature | Provider configuration admin UI                      | SPEC-0009 | Implemented |
| SPEC-0012 | Feature | Model allowlist governance                           | SPEC-0009 | Implemented |
| SPEC-0013 | Feature | Facilitator authentication and administrative access | null      | Implemented |
| SPEC-0014 | Feature | Workshop entity and join flow                        | SPEC-0001 | Implemented |
| SPEC-0015 | Feature | Automated specification linting                      | SPEC-0008 | Draft       |
