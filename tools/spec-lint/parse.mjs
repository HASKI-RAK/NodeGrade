// Minimal markdown/YAML-frontmatter reader for specs/. Deliberately not a general
// parser: it understands exactly the shapes specs/SPEC-NNNN-*/spec.md uses.

const LOCAL_ID = String.raw`(?:FR|NFR|AC|US)-\d{3}[a-z]?`

export const SPEC_ID_RE = /SPEC-\d{4}/g
export const QUALIFIED_REF_RE = new RegExp(String.raw`(SPEC-\d{4})\/(${LOCAL_ID})`, 'g')
export const HEADING_RE = new RegExp(String.raw`^###\s+(${LOCAL_ID})\b\s*(?:[—-]\s*(.*))?$`)
export const LOCAL_ID_RE = new RegExp(`^${LOCAL_ID}$`)

const SCALAR_RE = /^([a-z_]+):\s*(.*)$/
const ITEM_RE = /^\s*-\s+(.*\S)\s*$/

/**
 * Reads the `---` delimited frontmatter block.
 * Returns `{ data, bodyStart, error }`; `data` maps keys to strings or string arrays.
 */
export function parseFrontmatter(lines) {
  if (lines[0]?.trim() !== '---') {
    return { data: {}, bodyStart: 0, error: 'file does not start with a frontmatter block' }
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end === -1) {
    return { data: {}, bodyStart: 0, error: 'frontmatter block is never closed' }
  }

  const data = {}
  let listKey = null
  for (let index = 1; index < end; index++) {
    const raw = lines[index]
    if (!raw.trim()) continue

    const item = ITEM_RE.exec(raw)
    if (item && listKey) {
      data[listKey].push(unquote(item[1]))
      continue
    }

    const scalar = SCALAR_RE.exec(raw)
    if (!scalar) {
      return { data, bodyStart: end + 1, error: `unparsable frontmatter line ${index + 1}: ${raw}` }
    }

    const [, key, rest] = scalar
    const value = rest.trim()
    if (value === '') {
      data[key] = []
      listKey = key
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim()
      data[key] = inner ? inner.split(',').map((entry) => unquote(entry.trim())) : []
      listKey = null
    } else {
      data[key] = unquote(value)
      listKey = null
    }
  }
  return { data, bodyStart: end + 1, error: null }
}

function unquote(value) {
  return value.replace(/^["'](.*)["']$/, '$1')
}

/**
 * Splits a spec document into its `##` sections and its `### FR-001` style headings,
 * tracking which lines sit inside fenced code blocks so that Gherkin examples never
 * count as references.
 */
export function parseSpec(text) {
  const lines = text.split('\n')
  const frontmatter = parseFrontmatter(lines)
  const sections = new Map()
  const headings = []
  const prose = []

  let section = null
  let heading = null
  let fenced = false

  for (let index = frontmatter.bodyStart; index < lines.length; index++) {
    const raw = lines[index]
    const line = index + 1

    if (/^\s*```/.test(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) {
      heading?.fencedLines.push(raw)
      continue
    }

    prose.push({ line, text: raw })

    const h3 = HEADING_RE.exec(raw)
    if (h3) {
      heading = { id: h3[1], kind: h3[1].split('-')[0], title: h3[2] ?? '', line, section: section?.name ?? null, lines: [], fencedLines: [] }
      headings.push(heading)
      section?.headings.push(heading)
      continue
    }
    if (/^###\s/.test(raw)) {
      heading = null
      continue
    }

    const h2 = /^##\s+(.*\S)\s*$/.exec(raw)
    if (h2) {
      heading = null
      section = { name: h2[1], line, lines: [], headings: [] }
      sections.set(section.name, section)
      continue
    }

    section?.lines.push({ line, text: raw })
    heading?.lines.push({ line, text: raw })
  }

  return { lines, frontmatter, sections, headings, prose }
}

/** Table rows of the `| SPEC-0001 | Epic | ... |` shape in specs/index.md. */
export function parseIndex(text) {
  const rows = []
  text.split('\n').forEach((raw, index) => {
    if (!/^\|\s*SPEC-\d{4}\s*\|/.test(raw)) return
    const cells = raw.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length < 5) return
    const [id, type, title, parent, status] = cells
    rows.push({ id, type, title, parent, status, line: index + 1 })
  })
  return rows
}

/** The `Traces to: FR-001, SPEC-0004/FR-005` line of an acceptance criterion. */
export function parseTraces(heading) {
  const line = heading.lines.find((entry) => /^Traces\s+to:/i.test(entry.text.trim()))
  if (!line) return null
  const targets = line.text
    .replace(/^\s*Traces\s+to:/i, '')
    .split(',')
    .map((entry) => entry.trim().replace(/\.$/, ''))
    .filter(Boolean)
  return { line: line.line, targets }
}

export function bodyText(heading) {
  return heading.lines.map((entry) => entry.text).join('\n')
}
