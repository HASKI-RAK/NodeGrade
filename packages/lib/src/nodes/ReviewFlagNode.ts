/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import type { ReviewVerdict } from '../events'
import { LGraphNode, LiteGraph } from './litegraph-extensions'

/** Marker the bundled review prompts print when a human should look (SPEC-0020/FR-001). */
export const DEFAULT_FLAG_PATTERN = 'EDUCATOR_REVIEW'

/** Line prefix the bundled review prompts use for their one-sentence justification. */
export const DEFAULT_REASON_PREFIX = 'REASON:'

export type ReviewSignal = { flagged: boolean; reason: string }

type ReviewSignalOptions = { flagPattern: string; reasonPrefix: string }

const splitMarkers = (pattern: string): string[] =>
  pattern
    .split(',')
    .map((marker) => marker.trim().toLowerCase())
    .filter(Boolean)

/**
 * Decides whether a run needs a tutor from whatever reached the signal port.
 *
 * A boolean is the verdict itself. Text is flagged when it contains any of the
 * comma-separated markers, case-insensitively; the reason is the first line that
 * starts with the reason prefix, minus the prefix, so a two-line
 * `RECOMMENDATION:` / `REASON:` reply surfaces as one readable sentence. Text
 * without such a line is passed through whole, so a prompt that ignores the
 * convention still explains itself.
 */
export const evaluateReviewSignal = (
  input: unknown,
  { flagPattern, reasonPrefix }: ReviewSignalOptions
): ReviewSignal => {
  if (typeof input === 'boolean') return { flagged: input, reason: '' }
  if (input === null || input === undefined) return { flagged: false, reason: '' }
  const text = String(input).trim()
  const lower = text.toLowerCase()
  const flagged = splitMarkers(flagPattern).some((marker) => lower.includes(marker))
  const prefix = reasonPrefix.trim().toLowerCase()
  const reasonLine = prefix
    ? text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.toLowerCase().startsWith(prefix))
    : undefined
  const reason = reasonLine ? reasonLine.slice(prefix.length).trim() : text
  return { flagged, reason }
}

/**
 * Turns a review recommendation into a structured verdict the preview and the
 * Submissions inbox can count (SPEC-0020/FR-001, FR-002).
 *
 * Deliberately not an `OutputNode` subclass: the benchmark collects output nodes
 * by class and the xAPI statement picks the first score and text outputs, and a
 * flag is neither.
 */
export class ReviewFlagNode extends LGraphNode {
  properties: {
    label: string
    flagPattern: string
    reasonPrefix: string
    value: string
  }

  constructor() {
    super()
    this.title = 'Review flag'
    this.addIn(['string', 'boolean'], 'signal')
    this.addOut('boolean', 'flagged')
    this.properties = {
      label: 'Needs a tutor?',
      flagPattern: DEFAULT_FLAG_PATTERN,
      reasonPrefix: DEFAULT_REASON_PREFIX,
      value: ''
    }
    this.addWidget(
      'text',
      'Label',
      this.properties.label,
      (t) => {
        this.properties.label = t
      },
      { placeholder: 'Label' }
    )
    this.addWidget(
      'text',
      'Flag markers',
      this.properties.flagPattern,
      (t) => {
        this.properties.flagPattern = t
      },
      { placeholder: DEFAULT_FLAG_PATTERN }
    )
    this.addWidget(
      'text',
      'Reason prefix',
      this.properties.reasonPrefix,
      (t) => {
        this.properties.reasonPrefix = t
      },
      { placeholder: DEFAULT_REASON_PREFIX }
    )
    this.serialize_widgets = true
  }

  static title = 'Review flag'

  static path = 'output/review-flag'

  static getPath(): string {
    return ReviewFlagNode.path
  }

  async onExecute() {
    const { flagged, reason } = evaluateReviewSignal(
      this.getInputData(0),
      this.properties
    )
    const verdict: ReviewVerdict = flagged ? 'flagged' : 'clear'
    this.properties.value = reason
    this.setOutputData(0, flagged)
    this.emitEventCallback?.({
      eventName: 'outputSet',
      payload: {
        uniqueId: this.id.toString(),
        type: 'review',
        verdict,
        label: this.properties.label,
        value: reason
      }
    })
  }

  static register() {
    LiteGraph.registerNodeType(ReviewFlagNode.path, ReviewFlagNode)
  }
}
