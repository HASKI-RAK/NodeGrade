import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { lintSpecs } from './lint.mjs'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

/** A structurally valid specification; each test bends exactly one thing out of shape. */
function specDocument(spec) {
  const {
    id,
    title,
    type = 'feature',
    status = 'draft',
    parent = 'null',
    dependsOn = [],
    body = defaultBody()
  } = spec
  const list = (values) => (values.length === 0 ? ' []' : `\n${values.map((value) => `  - ${value}`).join('\n')}`)
  const dependencies = dependsOn.length === 0 ? '- None.' : dependsOn.map((value) => `- ${value} (needed).`).join('\n')
  return `---
id: ${id}
type: ${type}
title: ${title}
status: ${status}
parent: ${parent}
priority: P2
created: 2026-09-15
updated: 2026-09-15
depends_on:${list(dependsOn)}
related: []
---

# ${title}

${body}

## Dependencies

${dependencies}
`
}

function defaultBody() {
  return `## Functional requirements

### FR-001 — Something happens

WHEN a thing happens,
the system SHALL record it.

## Non-functional requirements

### NFR-001 — Speed

Recording SHALL complete quickly.

Verification: timed test.

## Acceptance criteria

### AC-001 — Thing is recorded

Traces to: FR-001

\`\`\`gherkin
Given a thing
When it happens
Then it is recorded
\`\`\``
}

/** Writes a throwaway specification set and returns its directory. */
function specSet(specs, { indexRows = specs, extraIndex = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'spec-lint-'))
  for (const spec of specs) {
    const slugDir = join(dir, `${spec.id}-${spec.slug}`)
    mkdirSync(slugDir)
    writeFileSync(join(slugDir, 'spec.md'), specDocument(spec))
  }
  const rows = indexRows
    .map((spec) => `| ${spec.id} | ${spec.type ?? 'feature'} | ${spec.title} | ${spec.parent ?? 'null'} | ${spec.status ?? 'draft'} |`)
    .join('\n')
  writeFileSync(
    join(dir, 'index.md'),
    `# Specification index\n\n| ID | Type | Title | Parent | Status |\n| --- | --- | --- | --- | --- |\n${rows}\n${extraIndex}`
  )
  return dir
}

const baseSpec = { id: 'SPEC-0001', slug: 'alpha', title: 'Alpha' }
const rules = (errors) => errors.map((error) => error.rule)

test('a consistent specification set reports no errors', () => {
  assert.deepEqual(lintSpecs(specSet([baseSpec])), [])
})

test('AC-001 — a frontmatter field disagreeing with the index is reported', () => {
  const dir = specSet([{ ...baseSpec, status: 'implemented' }], {
    indexRows: [{ ...baseSpec, status: 'draft' }]
  })
  const errors = lintSpecs(dir)
  assert.deepEqual(rules(errors), ['index-mismatch'])
  assert.match(errors[0].message, /status "implemented" disagrees with the index entry "draft"/)
})

test('AC-002 — depends_on disagreeing with the Dependencies section is reported', () => {
  const dir = specSet([
    baseSpec,
    { id: 'SPEC-0002', slug: 'beta', title: 'Beta', dependsOn: ['SPEC-0001'] }
  ])
  const file = join(dir, 'SPEC-0002-beta', 'spec.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('- SPEC-0001 (needed).', '- None.'))
  const errors = lintSpecs(dir)
  assert.deepEqual(rules(errors), ['dependencies-mismatch'])
  assert.match(errors[0].message, /SPEC-0001 is in depends_on but missing/)
})

test('AC-003 — a reference to a specification that does not exist is reported', () => {
  const dir = specSet([
    { ...baseSpec, body: `${defaultBody()}\n\nSee SPEC-0099/FR-001 for details.` }
  ])
  const errors = lintSpecs(dir)
  assert.deepEqual(rules(errors), ['dangling-reference'])
  assert.match(errors[0].message, /SPEC-0099 does not exist/)
  assert.match(errors[0].file, /SPEC-0001-alpha/)
})

test('AC-003 — a qualified reference to a requirement that does not exist is reported', () => {
  const dir = specSet([
    baseSpec,
    { id: 'SPEC-0002', slug: 'beta', title: 'Beta', body: `${defaultBody()}\n\nSee SPEC-0001/FR-404.` }
  ])
  const errors = lintSpecs(dir)
  assert.deepEqual(rules(errors), ['dangling-reference'])
  assert.match(errors[0].message, /SPEC-0001\/FR-404 references a requirement SPEC-0001 does not declare/)
})

test('AC-004 — a dependency cycle is reported', () => {
  const dir = specSet([
    { ...baseSpec, dependsOn: ['SPEC-0002'] },
    { id: 'SPEC-0002', slug: 'beta', title: 'Beta', dependsOn: ['SPEC-0001'] }
  ])
  const errors = lintSpecs(dir).filter((error) => error.rule === 'dependency-cycle')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /SPEC-0001 -> SPEC-0002 -> SPEC-0001/)
})

test('AC-005 — a duplicated local identifier is reported', () => {
  const dir = specSet([
    {
      ...baseSpec,
      body: defaultBody().replace('### NFR-001 — Speed', '### FR-001 — Something else\n\nA note.\n\n### NFR-001 — Speed')
    }
  ])
  const errors = lintSpecs(dir).filter((error) => error.rule === 'duplicate-id')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /FR-001 is declared twice/)
})

test('AC-006 — a SHALL requirement without traceability is reported', () => {
  const dir = specSet([{ ...baseSpec, body: defaultBody().replace('Traces to: FR-001', 'Traces to: NFR-001') }])
  const errors = lintSpecs(dir).filter((error) => error.rule === 'uncovered-requirement')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /FR-001 contains SHALL/)
})

test('AC-006 — an explicit verification note satisfies traceability', () => {
  const body = defaultBody()
    .replace('Traces to: FR-001', 'Traces to: NFR-001')
    .replace('the system SHALL record it.', 'the system SHALL record it.\n\nVerification: manual inspection.')
  assert.deepEqual(lintSpecs(specSet([{ ...baseSpec, body }])), [])
})

test('AC-007 — a missing frontmatter field is reported', () => {
  const dir = specSet([baseSpec])
  const file = join(dir, 'SPEC-0001-alpha', 'spec.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('parent: null\n', ''))
  const errors = lintSpecs(dir).filter((error) => error.rule === 'frontmatter-missing-field')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /"parent" is missing/)
})

test('AC-007 — an id that does not match its directory is reported', () => {
  const dir = specSet([baseSpec])
  const file = join(dir, 'SPEC-0001-alpha', 'spec.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('id: SPEC-0001', 'id: SPEC-0002'))
  const errors = lintSpecs(dir).filter((error) => error.rule === 'frontmatter-id-mismatch')
  assert.equal(errors.length, 1)
})

test('AC-008 — a specification directory with no index entry is reported', () => {
  const dir = specSet([baseSpec, { id: 'SPEC-0002', slug: 'beta', title: 'Beta' }], {
    indexRows: [baseSpec]
  })
  const errors = lintSpecs(dir).filter((error) => error.rule === 'index-entry-missing')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /SPEC-0002 has a directory but no entry/)
})

test('AC-008 — an index entry with no specification directory is reported', () => {
  const dir = specSet([baseSpec], {
    indexRows: [baseSpec, { id: 'SPEC-0002', slug: 'beta', title: 'Beta' }]
  })
  const errors = lintSpecs(dir).filter((error) => error.rule === 'index-entry-dangling')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /index lists SPEC-0002/)
})

test('AC-009 — the pull-request workflow runs the specification linter', () => {
  const workflow = readFileSync(join(repoRoot, '.github/workflows/pr.yml'), 'utf8')
  assert.match(workflow, /node tools\/spec-lint\/cli\.mjs/)
  assert.match(workflow, /node --test tools\/spec-lint\/lint\.test\.mjs/)
})

test('AC-011 — a non-functional requirement without verification is reported', () => {
  const dir = specSet([{ ...baseSpec, body: defaultBody().replace('\nVerification: timed test.\n', '') }])
  const errors = lintSpecs(dir).filter((error) => error.rule === 'uncovered-requirement')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /NFR-001 has no "Verification:" note/)
})

test('AC-010 and NFR-001 — the repository specification set passes within 10 seconds', () => {
  const started = performance.now()
  const errors = lintSpecs(join(repoRoot, 'specs'))
  const duration = performance.now() - started
  assert.deepEqual(errors, [], errors.map((error) => `${error.file}:${error.line} ${error.message}`).join('\n'))
  assert.ok(duration < 10_000, `linting took ${duration.toFixed(0)} ms`)
})
