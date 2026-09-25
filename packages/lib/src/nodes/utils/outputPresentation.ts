import type { ChecklistItem, OutputTone } from '../../events'

/**
 * Pure helpers behind the output cards. They live in the shared library so the
 * node that emits an output and the card that draws it agree on what a tone map
 * or a `KEY: value` report means, and so the backend's tests can pin them down
 * without a browser.
 */

export const OUTPUT_TONES: readonly OutputTone[] = [
  'success',
  'warning',
  'error',
  'info',
  'neutral'
]

/**
 * Tokens the bundled prompts print, mapped to the colour a card gives them. An
 * output node ships with this map so a verdict is coloured out of the box; a
 * facilitator edits it in the inspector when a prompt uses other words.
 */
export const DEFAULT_TONE_MAP = [
  'CORRECT=success',
  'YES=success',
  'TRUE=success',
  'KEEP_AS_DRAFT=success',
  'INCOMPLETE=warning',
  'PARTIAL=warning',
  'MISCONCEPTION=error',
  'CONTRADICTORY=error',
  'EDUCATOR_REVIEW=error',
  'NO=error',
  'FALSE=error',
  'UNCLEAR=neutral',
  'TOO_VAGUE_OR_IRRELEVANT=neutral'
].join(', ')

const isTone = (value: string): value is OutputTone =>
  (OUTPUT_TONES as readonly string[]).includes(value)

/** Normalises a token so `too vague` and `TOO_VAGUE` hit the same entry. */
export const toneKey = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

/**
 * Parses `TOKEN=tone, TOKEN=tone` into a lookup. Entries that name no known
 * tone are dropped rather than rejected: a typo in one entry must not blank the
 * whole card.
 */
export const parseToneMap = (text: string | undefined): Record<string, OutputTone> => {
  const map: Record<string, OutputTone> = {}
  String(text ?? '')
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [rawKey, rawTone] = entry.split('=')
      const key = toneKey(rawKey)
      const tone = String(rawTone ?? '')
        .trim()
        .toLowerCase()
      if (key && isTone(tone)) map[key] = tone
    })
  return map
}

/**
 * The tone for a verdict or chip value. Booleans look up `TRUE`/`FALSE`; strings
 * are normalised. Undefined means the map has nothing to say and the card stays
 * neutral.
 */
export const toneFor = (
  value: unknown,
  toneMap: string | undefined
): OutputTone | undefined => {
  const map = parseToneMap(toneMap)
  if (typeof value === 'boolean') return map[value ? 'TRUE' : 'FALSE']
  return map[toneKey(value)]
}

export type ReportEntry = { key: string; value: string }

export type ParsedReport = {
  /** A bare integer or decimal on the first line, as the rubric graders print it. */
  points?: number
  entries: ReportEntry[]
  /** Lines that belong to no `KEY:`; shown as plain prose. */
  prose: string[]
}

/**
 * Keys the bundled prompts use. A line whose key is one of these counts even when a
 * model writes it in title case; any other key must be upper-case, which is what
 * keeps "Note: …" prose out of the table.
 */
const KNOWN_KEYS = new Set([
  'JUDGMENT',
  'EVIDENCE',
  'REASON',
  'REASONING',
  'EXPLANATION',
  'NEXT_STEP',
  'NEXT_STEPS',
  'CATEGORY',
  'REVIEW',
  'RECOMMENDATION',
  'CRITERION',
  'GAP',
  'HINT',
  'SUGGESTION',
  'REVISION',
  'TIP',
  'SCORE',
  'POINTS',
  'FEEDBACK',
  'VERDICT',
  'DECISION',
  'RESULT',
  'STATUS',
  'GRADE'
])

/**
 * A `KEY: value` line as models actually print it: optional list marker or
 * heading hashes, optional markdown emphasis around the key, an ASCII or
 * full-width colon, then the value.
 */
const KEY_LINE =
  /^(?:[-*+>#]+\s*|\d+[.)]\s+)?[*_`]*([A-Za-z][A-Za-z0-9 _/-]{0,40}?)[*_`]*\s*[:：]\s*(.*)$/
const NUMBER_LINE = /^-?\d+(?:[.,]\d+)?$/
const FENCE_LINE = /^`{3,}/

/** Strips markdown emphasis and backticks wrapped around a value. */
const unwrapMarkup = (value: string): string =>
  value.replace(/^[*_`\s]+/, '').replace(/[*_`\s]+$/, '')

const isReportKey = (key: string): boolean =>
  key === key.toUpperCase() || KNOWN_KEYS.has(toneKey(key))

/**
 * Splits a model reply written as `KEY: value` lines into entries. A line without
 * a key continues the entry before it, so a two-line reason stays one reason; a
 * leading line holding only a number is the awarded points. Code fences are
 * dropped, and emphasis around keys or values is ignored, because a model asked
 * for `JUDGMENT: CORRECT` will happily print `**JUDGMENT:** CORRECT` instead.
 */
export const parseReport = (text: unknown): ParsedReport => {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !FENCE_LINE.test(line))
  const report: ParsedReport = { entries: [], prose: [] }
  const first = lines[0] === undefined ? undefined : unwrapMarkup(lines[0])
  if (first !== undefined && NUMBER_LINE.test(first)) {
    report.points = Number(first.replace(',', '.'))
    lines.shift()
  }
  lines.forEach((line) => {
    const match = KEY_LINE.exec(line)
    if (match && isReportKey(match[1].trim())) {
      report.entries.push({
        key: match[1].trim(),
        value: unwrapMarkup(match[2])
      })
      return
    }
    const last = report.entries[report.entries.length - 1]
    if (last) last.value = last.value ? `${last.value}\n${line}` : line
    else report.prose.push(line)
  })
  return report
}

/**
 * The entry that becomes the headline chip: the one whose key matches
 * `statusKey`, or the first entry when no key is configured. A configured key
 * that is absent yields nothing, so a card never promotes the wrong line.
 */
export const reportHeadline = (
  report: ParsedReport,
  statusKey: string | undefined
): ReportEntry | undefined => {
  const wanted = toneKey(statusKey?.replace(/:$/, ''))
  if (!wanted) return report.entries[0]
  return report.entries.find((entry) => toneKey(entry.key) === wanted)
}

/** True for the array shape a `checklist` output carries. */
export const isChecklist = (value: unknown): value is ChecklistItem[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof Reflect.get(item, 'label') === 'string' &&
      typeof Reflect.get(item, 'ok') === 'boolean'
  )
