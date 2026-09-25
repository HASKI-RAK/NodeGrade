/**
 * The deterministic stages of the semantic-equivalence cascade.
 *
 * Cosine similarity answers "how related are these?". Grading needs "do these
 * mean the same thing?", and the two come apart precisely on the pairs a
 * short-answer task produces: `17` / `42`, `Yes` / `No`, `increases` /
 * `decreases`. No embedding model separates those reliably, because they *are*
 * strongly related — so the cases a rule can settle are settled by a rule
 * first, and only the rest reach a model.
 *
 * Everything here is pure and synchronous: the worker-backed stages live in
 * `SemanticEquivalenceNode`, and these can be tested without a network.
 */

export type HardCheckReason =
  | 'exact'
  | 'number-match'
  | 'number-mismatch'
  | 'polarity-match'
  | 'polarity-mismatch'

export type HardCheck = {
  equivalent: boolean
  reason: HardCheckReason
}

export type Polarity = 'affirmative' | 'negative'

export type HardCheckOptions = {
  /** Compare the numbers in both texts, and disagree when they differ. */
  checkNumbers?: boolean
  /** Treat a bare yes/no answer as a polarity, not as a phrase to embed. */
  checkPolarity?: boolean
}

/**
 * Case, surrounding whitespace, repeated spaces and trailing punctuation are
 * never the difference between a right and a wrong short answer, so they are
 * removed before anything else looks at the text. Intentionally *not* a stemmer:
 * "rotates" and "rotation" should stay different strings and be settled by the
 * embedding stage, which knows they are close.
 */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .trim()
    .replace(/^[.,;:!?'"`´“”„‚‘’()[\]{}-]+|[.,;:!?'"`´“”„‚‘’()[\]{}-]+$/g, '')
    .trim()
}

const NUMBER_PATTERN = /-?\d[\d.,]*/g

/**
 * A number nobody can read without knowing the locale: `1.000` is one thousand
 * to a German reader and one to an English one. There is no evidence in the
 * text to settle it, so the number rule stands down and the later stages judge
 * the wording instead of a guess.
 */
function isAmbiguousGrouping(token: string): boolean {
  return /^-?\d{1,3}[.,]\d{3}$/.test(token)
}

/** Whether any number in the text is locale-ambiguous. */
export function hasAmbiguousNumber(value: string): boolean {
  return (value.match(NUMBER_PATTERN) ?? []).some(isAmbiguousGrouping)
}

/**
 * Every number the text states. A decimal comma reads as a decimal point, since
 * German answers write `3,14`, and in a number carrying both separators the
 * last one is the decimal: `1.234,56` and `1,234.56` are the same quantity.
 */
export function extractNumbers(value: string): number[] {
  const matches = value.match(NUMBER_PATTERN) ?? []
  const numbers: number[] = []
  for (const match of matches) {
    const lastComma = match.lastIndexOf(',')
    const lastDot = match.lastIndexOf('.')
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const cleaned = match
      .split('')
      .filter(
        (character, index) =>
          character !== ',' && character !== '.'
            ? true
            : character === decimalSeparator &&
              index === (decimalSeparator === ',' ? lastComma : lastDot)
      )
      .join('')
      .replace(',', '.')
    const parsed = Number.parseFloat(cleaned)
    if (Number.isFinite(parsed)) numbers.push(parsed)
  }
  return numbers
}

/** Whether the text is numbers and separators only, with no wording around them. */
function isBareNumber(value: string): boolean {
  return value.replace(/[-\d.,\s]/g, '') === '' && /\d/.test(value)
}

/**
 * Tokens that are an answer in themselves. Kept to whole-answer matches: an
 * explanation that merely starts with "No" is a sentence, not a polarity, and
 * belongs to the embedding stage.
 */
const AFFIRMATIVE = new Set([
  'yes',
  'yeah',
  'yep',
  'y',
  'true',
  'correct',
  'right',
  'ja',
  'jawohl',
  'richtig',
  'wahr',
  'stimmt',
  'zutreffend'
])

const NEGATIVE = new Set([
  'no',
  'nope',
  'n',
  'false',
  'incorrect',
  'wrong',
  'nein',
  'falsch',
  'unwahr',
  'nicht richtig',
  'nicht wahr',
  'trifft nicht zu'
])

/** The polarity a whole answer states, or `undefined` when it states none. */
export function detectPolarity(value: string): Polarity | undefined {
  const normalized = normalizeAnswer(value)
  if (AFFIRMATIVE.has(normalized)) return 'affirmative'
  if (NEGATIVE.has(normalized)) return 'negative'
  return undefined
}

/**
 * The verdict rules alone can reach, or `undefined` when the pair needs a model.
 *
 * Order matters. Exact equality is the strongest evidence there is. Numbers
 * come next because a stated quantity is the claim, not a shade of it. Polarity
 * last, and only when both sides are bare polarity answers.
 */
export function hardCheck(
  answer: string,
  expected: string,
  options: HardCheckOptions = {}
): HardCheck | undefined {
  const { checkNumbers = true, checkPolarity = true } = options
  const normalizedAnswer = normalizeAnswer(answer)
  const normalizedExpected = normalizeAnswer(expected)
  if (!normalizedAnswer || !normalizedExpected) return undefined
  if (normalizedAnswer === normalizedExpected) {
    return { equivalent: true, reason: 'exact' }
  }

  if (checkPolarity) {
    const answerPolarity = detectPolarity(normalizedAnswer)
    const expectedPolarity = detectPolarity(normalizedExpected)
    if (answerPolarity && expectedPolarity) {
      return answerPolarity === expectedPolarity
        ? { equivalent: true, reason: 'polarity-match' }
        : { equivalent: false, reason: 'polarity-mismatch' }
    }
  }

  if (
    checkNumbers &&
    !hasAmbiguousNumber(normalizedAnswer) &&
    !hasAmbiguousNumber(normalizedExpected)
  ) {
    const answerNumbers = extractNumbers(normalizedAnswer)
    const expectedNumbers = extractNumbers(normalizedExpected)
    // Only decide when both sides state quantities. "seventeen" against "17"
    // has no numbers on one side and is a job for the embedding stage.
    if (answerNumbers.length > 0 && expectedNumbers.length > 0) {
      const sameValues =
        answerNumbers.length === expectedNumbers.length &&
        answerNumbers.every((number, index) => number === expectedNumbers[index])
      if (!sameValues) return { equivalent: false, reason: 'number-mismatch' }
      // Equal numbers are necessary, not sufficient: "5 metres" and "5 seconds"
      // agree numerically and mean different things, so wording still has to
      // pass the later stages. Two answers that are *nothing but* the same
      // numbers have no wording left to disagree about, which is what makes
      // "3,14" and "3.14" the same answer.
      if (isBareNumber(normalizedAnswer) && isBareNumber(normalizedExpected))
        return { equivalent: true, reason: 'number-match' }
    }
  }

  return undefined
}

/**
 * The spans a keyword is compared against.
 *
 * One keyword embedded against a whole multi-sentence answer scores low no
 * matter how plainly that answer contains the idea: the keyword's meaning is
 * one thirtieth of the vector it is compared with. Scoring against each
 * sentence and keeping the best score removes that dilution. The whole text
 * stays in the list so a single-sentence answer behaves exactly as before.
 */
export function splitIntoSpans(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const sentences = trimmed
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
  const spans = sentences.length > 1 ? [trimmed, ...sentences] : [trimmed]
  return [...new Set(spans)]
}
