---
id: SPEC-0015
type: feature
title: Automated specification linting
status: implemented
parent: SPEC-0008
priority: P2
created: 2026-09-15
updated: 2026-09-17
depends_on:
  - SPEC-0008
related:
  - SPEC-0001
---

# Automated specification linting

## Intent

### Problem

The specification set is maintained by hand and has repeatedly accumulated
consistency errors of the same small, mechanical classes: frontmatter `parent`
disagreeing with the index, `depends_on` disagreeing with the `## Dependencies`
section, references to nonexistent specification IDs, missing acceptance criteria for
`SHALL` requirements, duplicate FR/AC identifiers, and potential circular
dependencies. These errors are exactly the kind a small checker can catch, and they
have required repeated manual review rounds to find.

### Desired outcome

A linting step over `specs/` that detects the known error classes automatically and
fails CI when a specification violation is introduced, so manual review focuses on
content rather than cross-reference bookkeeping.

## Scope

### In scope

- A linter that validates every `specs/SPEC-NNNN-*/spec.md` file and `specs/index.md`.
- Checks: frontmatter `parent`, `type`, `title` and `status` versus index agreement;
  `depends_on` versus the `## Dependencies` prose section agreement; existence of all
  referenced SPEC/FR/AC IDs; circular dependency detection; duplicate FR/AC/US IDs
  within a specification; `SHALL`-containing functional requirements lacking
  acceptance-criterion traceability or an explicit verification note; non-functional
  requirements lacking either; required frontmatter fields present and well-formed.
- A CLI invocation for local use and a CI step gating pull requests on lint failures.
- Fixing the currently known NFR verification gaps (NFRs without explicit
  verification, as demonstrated correctly in SPEC-0013 and SPEC-0014).

### Out of scope

- Natural-language quality judgment of requirement wording (vagueness detection is
  limited to the mechanical `SHALL`-coverage check).
- Validation of implementation code or tests against specifications.
- Cross-repository specification validation.

## Actors

- Contributor: runs the linter locally before committing specification changes.
- CI pipeline: runs the linter on pull requests touching `specs/`.

## User scenarios

### US-001 — Catch inconsistent metadata before review

As a contributor,
I want the linter to flag parent/index or dependency mismatches when I edit a spec,
so that I fix them immediately instead of discovering them in a review round.

Priority: P2

Independent value: removes the most common class of specification drift without
human effort.

### US-002 — Protect requirement traceability

As a maintainer,
I want CI to fail when a `SHALL` requirement has no acceptance criterion or explicit
verification,
so that every normative requirement stays verifiable.

Priority: P2

Independent value: keeps the quality gate enforceable as the spec set grows.

## Functional requirements

### FR-001 — Index agreement

IF a specification's frontmatter `parent`, `type`, `title` or `status` disagrees with
the corresponding column of its `specs/index.md` entry,
THEN the linter SHALL report an error identifying both files and values.

### FR-002 — Dependency section agreement

IF a specification's frontmatter `depends_on` list disagrees with the SPEC references
in its `## Dependencies` prose section,
THEN the linter SHALL report an error identifying the missing or extra SPEC IDs in
each direction.

### FR-003 — Reference existence

IF any specification references a SPEC, FR, AC, or NFR identifier that does not exist
in the specification set (in the required qualified form, e.g. `SPEC-0014/FR-003`),
THEN the linter SHALL report an error naming the dangling reference and its source
file.

### FR-004 — Circular dependency detection

IF the dependency graph formed by all specifications' `depends_on` lists contains a
cycle,
THEN the linter SHALL report the cycle as an error listing the specifications
involved.

### FR-005 — Duplicate local identifiers

IF a specification contains two requirements or acceptance criteria with the same
local identifier (e.g. two FR-003 entries),
THEN the linter SHALL report an error naming the duplicated ID and both locations.

### FR-006 — SHALL coverage

IF a functional requirement contains `SHALL` and has no acceptance criterion tracing
to it and no explicit verification note,
THEN the linter SHALL report an error naming the uncovered requirement.

### FR-007 — Frontmatter validity

IF a specification file is missing required frontmatter fields (id, type, title,
status, parent, priority, created, updated, depends_on, related) or its ID does not
match its directory name,
THEN the linter SHALL report an error.

### FR-008 — Index completeness

IF a specification directory exists in `specs/` without a corresponding index entry,
or the index lists a specification whose file or directory does not exist,
THEN the linter SHALL report an error.

### FR-009 — CI gating

WHEN a pull request modifies files under `specs/`,
CI SHALL run the specification linter and SHALL fail the check if any error is
reported.

### FR-010 — Non-functional requirement verification

IF a non-functional requirement has no acceptance criterion tracing to it and no
explicit verification note,
THEN the linter SHALL report an error naming the unverified requirement.

## Non-functional requirements

### NFR-001 — Lint duration

Linting the full specification set SHALL complete within 10 seconds.

Verification: run the linter on the repository's spec set; completion within 10
seconds on a standard development machine.

## Acceptance criteria

### AC-001 — Index mismatch detected

Traces to: FR-001

```gherkin
Given a specification whose frontmatter parent or status differs from its index entry
When the linter runs
Then an error is reported identifying the specification and both values
```

### AC-002 — Dependency mismatch detected

Traces to: FR-002

```gherkin
Given a specification whose depends_on omits a SPEC listed in its Dependencies section
When the linter runs
Then an error is reported naming the missing SPEC ID
```

### AC-003 — Dangling reference detected

Traces to: FR-003

```gherkin
Given a specification referencing SPEC-0099/FR-001 where SPEC-0099 does not exist
When the linter runs
Then an error is reported naming the dangling reference and its source file
```

### AC-004 — Circular dependency detected

Traces to: FR-004

```gherkin
Given SPEC-A depends on SPEC-B and SPEC-B depends on SPEC-A
When the linter runs
Then an error is reported listing the cycle
```

### AC-005 — Duplicate ID detected

Traces to: FR-005

```gherkin
Given a specification containing two sections titled FR-003
When the linter runs
Then an error is reported naming the duplicated ID and both locations
```

### AC-006 — Uncovered SHALL detected

Traces to: FR-006

```gherkin
Given a functional requirement containing SHALL with no tracing acceptance criterion
When the linter runs
Then an error is reported naming the uncovered requirement
```

### AC-007 — Malformed frontmatter detected

Traces to: FR-007

```gherkin
Given a specification file missing the required parent field
When the linter runs
Then an error is reported identifying the file and the missing field
```

### AC-008 — Index inconsistency detected

Traces to: FR-008

```gherkin
Given a specification directory with no index entry
When the linter runs
Then an error is reported naming the missing index entry
```

### AC-009 — CI fails on lint error

Traces to: FR-009

```gherkin
Given a pull request introducing a specification lint error
When CI runs
Then the lint check fails and blocks merge per SPEC-0008/FR-008
```

### AC-010 — Current spec set passes

Traces to: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-010

```gherkin
Given the specification set as of this revision
When the linter runs
Then no errors are reported
```

### AC-011 — Unverified non-functional requirement detected

Traces to: FR-010

```gherkin
Given a non-functional requirement with no verification note and no tracing acceptance criterion
When the linter runs
Then an error is reported naming the unverified requirement
```

## Edge cases

- Legacy-style requirements without `SHALL` (e.g. non-normative notes) → not flagged
  by the SHALL-coverage check.
- A specification with `status: draft` and deliberately unresolved open questions →
  linting validates structure and references, not completeness of open questions.
- Index entries for specifications whose directories were renamed → caught by
  FR-008's bidirectional check.

## Business rules

- Lint errors SHALL be treated as build failures, not warnings.

## Constraints

- The linter operates on the plain-text markdown and YAML frontmatter of `specs/`;
  no external specification database is introduced.

## Dependencies

- SPEC-0008 (the pull-request pipeline the lint step gates into; the check attaches to
  the existing PR workflow that SPEC-0008 extends).

## Assumptions

- Requirement and acceptance-criterion identifiers follow the existing local ID
  conventions (FR-NNN, NFR-NNN, AC-NNN, US-NNN) and the SPEC-NNNN scheme.
- A `## Dependencies` bullet beginning with "None" declares no dependency, and
  parenthetical asides in that section give context rather than naming dependencies.

## Open questions

- None currently.

## Success criteria

- The classes of consistency errors found in past review rounds (parent/index,
  dependencies, dangling references, duplicates, missing traceability) are detected
  automatically, and a clean specification set passes CI.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Initial specification created from review feedback (automated spec linting of hierarchy/dependency/traceability consistency) |
| 2026-09-17 | Implemented. FR-001 extended to type/title/status index agreement; FR-010 and AC-011 added for non-functional requirement verification, resolving the open question; Dependencies-section reading convention recorded under Assumptions |
