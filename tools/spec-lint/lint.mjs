import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import { bodyText, parseIndex, parseSpec, parseTraces, QUALIFIED_REF_RE, SPEC_ID_RE } from './parse.mjs'

const REQUIRED_FRONTMATTER = [
  'id',
  'type',
  'title',
  'status',
  'parent',
  'priority',
  'created',
  'updated',
  'depends_on',
  'related'
]
const TYPES = ['epic', 'feature']
const STATUSES = ['draft', 'implemented', 'deferred']
const SPEC_DIR_RE = /^SPEC-(\d{4})-[a-z0-9-]+$/

/**
 * Lints the specification set rooted at `specsDir`.
 * Returns errors sorted by file and line; an empty array means the set is consistent.
 */
export function lintSpecs(specsDir) {
  const errors = []
  const report = (file, line, rule, message) => errors.push({ file, line, rule, message })

  const specs = loadSpecs(specsDir, report)
  const byId = new Map(specs.map((spec) => [spec.id, spec]))
  const indexFile = join(specsDir, 'index.md')
  const indexText = readFileSync(indexFile, 'utf8')
  const indexRows = parseIndex(indexText)

  for (const spec of specs) {
    checkFrontmatter(spec, report)
    checkDuplicateIds(spec, report)
  }

  checkIndex({ specs, indexRows, indexFile, report })
  checkDependencySections(specs, report)
  checkReferences({ specs, byId, indexFile, indexText, report })
  checkCycles(specs, byId, report)
  checkCoverage(specs, report)

  return errors.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

function loadSpecs(specsDir, report) {
  const specs = []
  for (const entry of readdirSync(specsDir).sort()) {
    const dir = join(specsDir, entry)
    if (!statSync(dir).isDirectory()) continue
    if (!SPEC_DIR_RE.test(entry)) {
      report(dir, 1, 'spec-directory-name', `directory "${entry}" does not follow the SPEC-NNNN-slug convention`)
      continue
    }
    const file = join(dir, 'spec.md')
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      report(file, 1, 'spec-file-missing', `specification directory "${entry}" has no spec.md`)
      continue
    }
    const doc = parseSpec(text)
    specs.push({
      id: doc.frontmatter.data.id ?? `SPEC-${SPEC_DIR_RE.exec(entry)[1]}`,
      dirName: entry,
      dir,
      file,
      text,
      doc
    })
  }
  return specs
}

function checkFrontmatter(spec, report) {
  const { data, error } = spec.doc.frontmatter
  if (error) {
    report(spec.file, 1, 'frontmatter-malformed', error)
    return
  }

  for (const field of REQUIRED_FRONTMATTER) {
    if (data[field] === undefined) {
      report(spec.file, 1, 'frontmatter-missing-field', `required frontmatter field "${field}" is missing`)
    }
  }

  const expectedId = `SPEC-${SPEC_DIR_RE.exec(spec.dirName)[1]}`
  if (data.id !== undefined && data.id !== expectedId) {
    report(spec.file, 1, 'frontmatter-id-mismatch', `frontmatter id "${data.id}" does not match directory "${spec.dirName}" (expected ${expectedId})`)
  }
  if (data.type !== undefined && !TYPES.includes(data.type)) {
    report(spec.file, 1, 'frontmatter-invalid-value', `type "${data.type}" is not one of ${TYPES.join(', ')}`)
  }
  if (data.status !== undefined && !STATUSES.includes(data.status)) {
    report(spec.file, 1, 'frontmatter-invalid-value', `status "${data.status}" is not one of ${STATUSES.join(', ')}`)
  }
  if (typeof data.priority === 'string' && !/^P\d$/.test(data.priority)) {
    report(spec.file, 1, 'frontmatter-invalid-value', `priority "${data.priority}" is not of the form P0, P1, ...`)
  }
  for (const field of ['created', 'updated']) {
    const value = data[field]
    if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      report(spec.file, 1, 'frontmatter-invalid-value', `${field} "${value}" is not an ISO date`)
    }
  }
  if (typeof data.parent === 'string' && data.parent !== 'null' && !/^SPEC-\d{4}$/.test(data.parent)) {
    report(spec.file, 1, 'frontmatter-invalid-value', `parent "${data.parent}" is neither null nor a SPEC id`)
  }
  for (const field of ['depends_on', 'related']) {
    if (data[field] !== undefined && !Array.isArray(data[field])) {
      report(spec.file, 1, 'frontmatter-invalid-value', `${field} must be a list`)
    }
  }
}

function checkDuplicateIds(spec, report) {
  const seen = new Map()
  for (const heading of spec.doc.headings) {
    const first = seen.get(heading.id)
    if (first) {
      report(spec.file, heading.line, 'duplicate-id', `${heading.id} is declared twice (first at ${basename(spec.file)}:${first.line}, again at line ${heading.line})`)
      continue
    }
    seen.set(heading.id, heading)
  }
}

function checkIndex({ specs, indexRows, indexFile, report }) {
  const rowsById = new Map(indexRows.map((row) => [row.id, row]))

  for (const spec of specs) {
    const row = rowsById.get(spec.id)
    if (!row) {
      report(indexFile, 1, 'index-entry-missing', `${spec.id} has a directory but no entry in the index table`)
      continue
    }
    const data = spec.doc.frontmatter.data
    compareCell(spec, row, 'parent', data.parent, row.parent, report)
    compareCell(spec, row, 'status', data.status, row.status, report)
    compareCell(spec, row, 'type', data.type, row.type, report)
    compareCell(spec, row, 'title', data.title, row.title, report)
  }

  const idsWithDirectory = new Set(specs.map((spec) => spec.id))
  for (const row of indexRows) {
    if (!idsWithDirectory.has(row.id)) {
      report(indexFile, row.line, 'index-entry-dangling', `index lists ${row.id} but no matching specification directory exists`)
    }
  }
}

function compareCell(spec, row, field, specValue, indexValue, report) {
  if (specValue === undefined) return
  const normalise = (value) => String(value).trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalise(specValue) === normalise(indexValue)) return
  report(
    spec.file,
    1,
    'index-mismatch',
    `${field} "${specValue}" disagrees with the index entry "${indexValue}" (index.md:${row.line})`
  )
}

function checkDependencySections(specs, report) {
  for (const spec of specs) {
    const declared = spec.doc.frontmatter.data.depends_on
    if (!Array.isArray(declared)) continue
    const section = spec.doc.sections.get('Dependencies')
    if (!section) {
      if (declared.length > 0) {
        report(spec.file, 1, 'dependencies-section-missing', 'frontmatter declares depends_on but the document has no "## Dependencies" section')
      }
      continue
    }

    const prose = new Set(declaredInProse(section))
    const frontmatter = new Set(declared)

    for (const id of frontmatter) {
      if (!prose.has(id)) {
        report(spec.file, section.line, 'dependencies-mismatch', `${id} is in depends_on but missing from the "## Dependencies" section`)
      }
    }
    for (const id of prose) {
      if (!frontmatter.has(id)) {
        report(spec.file, section.line, 'dependencies-mismatch', `${id} is named in the "## Dependencies" section but missing from depends_on`)
      }
    }
  }
}

/**
 * The SPEC ids a "## Dependencies" section declares. Parenthetical asides are dropped
 * before the ids are read, and a bullet starting with "None" declares nothing at all —
 * "None (this is a prerequisite for SPEC-0002)" names a dependent, not a dependency.
 */
function declaredInProse(section) {
  const bullets = []
  for (const { text } of section.lines) {
    if (/^\s*-\s+/.test(text)) bullets.push(text.replace(/^\s*-\s+/, ''))
    else if (bullets.length > 0 && text.trim()) bullets[bullets.length - 1] += ` ${text.trim()}`
  }
  return bullets.flatMap((bullet) => {
    if (/^None\b/i.test(bullet)) return []
    return bullet.replaceAll(/\([^)]*\)/g, ' ').match(SPEC_ID_RE) ?? []
  })
}

function checkReferences({ specs, byId, indexFile, indexText, report }) {
  const localIds = new Map(
    specs.map((spec) => [spec.id, new Set(spec.doc.headings.map((heading) => heading.id))])
  )

  const checkSpecId = (file, line, id) => {
    if (byId.has(id)) return true
    report(file, line, 'dangling-reference', `${id} does not exist in the specification set`)
    return false
  }

  for (const spec of specs) {
    for (const { line, text } of spec.doc.prose) {
      for (const [, id, localId] of text.matchAll(QUALIFIED_REF_RE)) {
        if (!checkSpecId(spec.file, line, id)) continue
        if (!localIds.get(id).has(localId)) {
          report(spec.file, line, 'dangling-reference', `${id}/${localId} references a requirement ${id} does not declare`)
        }
      }
      for (const id of text.replaceAll(QUALIFIED_REF_RE, '').match(SPEC_ID_RE) ?? []) {
        checkSpecId(spec.file, line, id)
      }
    }

    const own = localIds.get(spec.id)
    for (const heading of spec.doc.headings) {
      const traces = parseTraces(heading)
      if (!traces) continue
      for (const target of traces.targets) {
        if (target.includes('/')) continue
        if (!own.has(target)) {
          report(spec.file, traces.line, 'dangling-reference', `${heading.id} traces to ${target}, which this specification does not declare`)
        }
      }
    }
  }

  indexText.split('\n').forEach((text, index) => {
    for (const id of text.match(SPEC_ID_RE) ?? []) {
      checkSpecId(indexFile, index + 1, id)
    }
  })
}

function checkCycles(specs, byId, report) {
  const state = new Map()
  const stack = []

  const visit = (spec) => {
    state.set(spec.id, 'visiting')
    stack.push(spec.id)
    for (const dependency of spec.doc.frontmatter.data.depends_on ?? []) {
      const next = byId.get(dependency)
      if (!next) continue
      if (state.get(next.id) === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(next.id)), next.id]
        report(spec.file, 1, 'dependency-cycle', `dependency cycle: ${cycle.join(' -> ')}`)
        continue
      }
      if (!state.has(next.id)) visit(next)
    }
    stack.pop()
    state.set(spec.id, 'done')
  }

  for (const spec of specs) {
    if (!state.has(spec.id)) visit(spec)
  }
}

function checkCoverage(specs, report) {
  const traced = new Set()
  for (const spec of specs) {
    for (const heading of spec.doc.headings) {
      const traces = parseTraces(heading)
      if (!traces) continue
      for (const target of traces.targets) {
        traced.add(target.includes('/') ? target : `${spec.id}/${target}`)
      }
    }
  }

  for (const spec of specs) {
    for (const heading of spec.doc.headings) {
      const body = bodyText(heading)
      const verified = /^\s*Verification:/im.test(body)

      if (heading.kind === 'FR' && /\bSHALL\b/.test(body)) {
        if (!verified && !traced.has(`${spec.id}/${heading.id}`)) {
          report(spec.file, heading.line, 'uncovered-requirement', `${heading.id} contains SHALL but no acceptance criterion traces to it and it carries no "Verification:" note`)
        }
      }

      if (heading.kind === 'NFR' && !verified && !traced.has(`${spec.id}/${heading.id}`)) {
        report(spec.file, heading.line, 'uncovered-requirement', `${heading.id} has no "Verification:" note and no acceptance criterion traces to it`)
      }
    }
  }
}
