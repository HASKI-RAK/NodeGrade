import { AnswerInputNode } from '../nodes/AnswerInputNode'
import { MaxInputChars } from '../nodes/MaxInputChars'
import { QuestionNode } from '../nodes/QuestionNode'

/**
 * The parts of a serialized node this module reads. Serialized graphs come from
 * `LGraph.serialize()` in the editor and from stored template content on the server,
 * so the shape is deliberately loose.
 */
export type WorkflowNodeSnapshot = {
  type?: string
  properties?: Record<string, unknown> | null
}

/**
 * Answer length bounds a workflow declares (SPEC-0007/FR-007, FR-008a).
 *
 * An absent bound means "not configured", which is what the preview enforces: no
 * fixed minimum and no fixed maximum live in the UI (FR-008).
 */
export type AnswerConstraints = {
  minChars?: number
  maxChars?: number
}

export type AnswerLengthViolation =
  | { code: 'too_short'; minChars: number }
  | { code: 'too_long'; maxChars: number }
  | { code: 'inconsistent_bounds'; minChars: number; maxChars: number }

const boundOf = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return undefined
  const whole = Math.floor(parsed)
  // Zero is how a workflow says "no bound"; a negative one is nonsense either way.
  return whole > 0 ? whole : undefined
}

const firstOfType = (
  nodes: readonly WorkflowNodeSnapshot[],
  type: string
): WorkflowNodeSnapshot | undefined => nodes.find((node) => node.type === type)

/**
 * Reads the answer length bounds out of the workflow itself.
 *
 * The answer node owns both bounds. The older `input/max-input-chars` node stays a
 * fallback for the maximum so workflows built before this spec keep their cap.
 */
export const resolveAnswerConstraints = (
  nodes: readonly WorkflowNodeSnapshot[]
): AnswerConstraints => {
  const answer = firstOfType(nodes, AnswerInputNode.path)
  const legacyMax = firstOfType(nodes, MaxInputChars.path)
  const minChars = boundOf(answer?.properties?.minChars)
  const maxChars =
    boundOf(answer?.properties?.maxChars) ?? boundOf(legacyMax?.properties?.value)
  return {
    ...(minChars === undefined ? {} : { minChars }),
    ...(maxChars === undefined ? {} : { maxChars })
  }
}

/** The question the workflow poses, read from its question node (FR-002, FR-003). */
export const resolveQuestionText = (
  nodes: readonly WorkflowNodeSnapshot[]
): string | undefined => {
  const value = firstOfType(nodes, QuestionNode.path)?.properties?.value
  return typeof value === 'string' ? value : undefined
}

/**
 * Checks an answer against the workflow's bounds, or reports that the bounds
 * themselves contradict each other (FR-008b) — no answer can satisfy them, and saying
 * so beats rejecting every attempt with a length message.
 */
export const checkAnswerLength = (
  answer: string,
  { minChars, maxChars }: AnswerConstraints
): AnswerLengthViolation | null => {
  if (minChars !== undefined && maxChars !== undefined && minChars > maxChars)
    return { code: 'inconsistent_bounds', minChars, maxChars }
  if (minChars !== undefined && answer.trim().length < minChars)
    return { code: 'too_short', minChars }
  if (maxChars !== undefined && answer.length > maxChars)
    return { code: 'too_long', maxChars }
  return null
}
