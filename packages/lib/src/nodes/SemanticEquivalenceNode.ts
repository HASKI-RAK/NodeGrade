/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'
import {
  hardCheck,
  normalizeAnswer,
  type HardCheckReason
} from './utils/semanticEquivalence'
import {
  fetchEntailment,
  fetchSimilarities,
  resolveSimilarityWorkerUrl
} from './utils/similarityWorker'

/**
 * Decides whether an answer means the same as the expected answer.
 *
 * `models/cosine-similarity` answers a different question — how *related* two
 * texts are — and the difference is not academic. Measured on this repository's
 * short-answer pairs, `bge-m3` scores "Yes"/"No" at 0.89 and "Yes"/"Correct" at
 * 0.61: the wrong answer looks more like the reference than the right one does.
 * No threshold fixes that, because relatedness is genuinely what the embedding
 * encodes.
 *
 * So the decision is staged, cheapest and most certain first:
 *
 *   1. exact match after normalisation — the strongest evidence there is
 *   2. polarity — a bare "no" against a bare "yes" is a decision, not a score
 *   3. numbers — a stated quantity is the claim; 5 is not 50
 *   4. embedding cosine, rejecting only — far enough apart is far enough apart,
 *      but close is not evidence of sameness and never accepts on its own
 *   5. entailment, in both directions — the stage that actually answers the
 *      question, and the only one that can call a contradiction
 *
 * On the calibration set in `docs/semantic-equivalence-calibration.md` that
 * chain scores 89% where cosine at the old 0.7 cutoff scores 43%, and it cuts
 * false positives from 14 to 2.
 *
 * Stage 5 needs a worker with an NLI model. Without one the node falls back to
 * the cosine ceiling and says so in the verdict, rather than failing the run.
 */

/** How the verdict was reached. Surfaced so a facilitator can see which stage decided. */
export type EquivalenceReason =
  | HardCheckReason
  | 'cosine-low'
  | 'cosine-only'
  | 'nli-entailment'
  | 'nli-contradiction'
  | 'nli-neutral'
  | 'nli-unavailable'
  | 'empty-input'

/**
 * Thresholds calibrated on a labelled set of short-answer pairs (see
 * `docs/semantic-equivalence-calibration.md`). Both ends are editable per node,
 * because a task with a narrow answer space wants a narrower band than an open
 * one, but the defaults are the measured optimum and favour precision: a wrong
 * answer marked correct is the expensive error in grading.
 */
/** Below this cosine the answer is rejected without consulting the model. */
export const DEFAULT_LOW_THRESHOLD = 0.6
/** At or above this cosine an otherwise undecided answer is accepted. */
export const DEFAULT_HIGH_THRESHOLD = 0.92
/** A contradiction this confident rejects, whatever the cosine says. */
const CONTRADICTION_PROBABILITY = 0.5
/** Entailment in both directions this confident accepts. */
const ENTAILMENT_PROBABILITY = 0.6

export class SemanticEquivalenceNode extends LGraphNode {
  properties: {
    lowThreshold: number
    highThreshold: number
    useEntailment: boolean
    checkNumbers: boolean
    checkPolarity: boolean
    similarity: number
    verdict: string
  }

  constructor() {
    super()
    this.addIn('string', 'answer')
    this.addIn('string', 'expected answer')
    this.addOut('boolean', 'equivalent')
    this.addOut('number', 'similarity')
    this.addOut('string', 'verdict')
    this.addWidget(
      'slider',
      'low threshold',
      DEFAULT_LOW_THRESHOLD,
      (value: number) => {
        this.properties.lowThreshold = value
      },
      { min: 0, max: 1, step: 0.01, precision: 2 }
    )
    this.addWidget(
      'slider',
      'high threshold',
      DEFAULT_HIGH_THRESHOLD,
      (value: number) => {
        this.properties.highThreshold = value
      },
      { min: 0, max: 1, step: 0.01, precision: 2 }
    )
    this.addWidget('toggle', 'verify with entailment', true, (value: boolean) => {
      this.properties.useEntailment = value
    })
    this.addWidget('toggle', 'compare numbers', true, (value: boolean) => {
      this.properties.checkNumbers = value
    })
    this.addWidget('toggle', 'compare yes/no', true, (value: boolean) => {
      this.properties.checkPolarity = value
    })
    this.properties = {
      lowThreshold: DEFAULT_LOW_THRESHOLD,
      highThreshold: DEFAULT_HIGH_THRESHOLD,
      useEntailment: true,
      checkNumbers: true,
      checkPolarity: true,
      similarity: 0,
      verdict: ''
    }
    this.title = 'Semantic Equivalence'
    this.serialize_widgets = true
  }

  static title = 'Semantic Equivalence'
  static path = 'text/semantic-equivalence'
  static getPath(): string {
    return SemanticEquivalenceNode.path
  }

  private publish(equivalent: boolean, similarity: number, reason: EquivalenceReason) {
    this.properties.similarity = similarity
    this.properties.verdict = reason
    this.setOutputData(0, equivalent)
    this.setOutputData(1, similarity)
    this.setOutputData(2, reason)
    // The stage that decided is not an output anyone would wire, but it is the
    // only thing that explains a verdict, so the trace carries it as detail.
    this.executionDetails = [
      {
        slot: 0,
        name: 'Decided by',
        type: 'string',
        value: reason,
        truncated: false
      }
    ]
  }

  async onExecute(): Promise<void> {
    const answer = String(this.getInputData(0) ?? '')
    const expected = String(this.getInputData(1) ?? '')
    if (!normalizeAnswer(answer) || !normalizeAnswer(expected)) {
      this.publish(false, 0, 'empty-input')
      return
    }

    const hard = hardCheck(answer, expected, {
      checkNumbers: this.properties.checkNumbers,
      checkPolarity: this.properties.checkPolarity
    })
    if (hard) {
      this.publish(hard.equivalent, hard.equivalent ? 1 : 0, hard.reason)
      return
    }

    const workerUrl = resolveSimilarityWorkerUrl(this.env)
    const [similarity = 0] = await fetchSimilarities(
      workerUrl,
      expected,
      [answer],
      this.executionSignal
    )

    // A property cleared in the inspector arrives as undefined; falling back to
    // the measured default beats comparing against NaN, which accepts nothing.
    const high = this.properties.highThreshold ?? DEFAULT_HIGH_THRESHOLD
    const low = this.properties.lowThreshold ?? DEFAULT_LOW_THRESHOLD
    // The floor is the one thing cosine decides on its own, and only in the
    // rejecting direction. A high cosine is *not* evidence of equivalence:
    // "The Sun orbits the Earth" against "The Earth orbits the Sun" measures
    // 0.97.
    if (similarity < low) {
      this.publish(false, similarity, 'cosine-low')
      return
    }
    if (!this.properties.useEntailment) {
      this.publish(similarity >= high, similarity, 'cosine-only')
      return
    }

    // Both directions: entailment is asymmetric, and an answer that merely
    // *follows from* the reference is not the same as one that states it.
    const scores = await fetchEntailment(
      workerUrl,
      [
        [expected, answer],
        [answer, expected]
      ],
      this.executionSignal
    )
    if (!scores || scores.length !== 2) {
      this.publish(similarity >= high, similarity, 'nli-unavailable')
      return
    }
    const [forward, backward] = scores
    const contradiction = Math.max(forward.contradiction, backward.contradiction)
    const entailment = Math.min(forward.entailment, backward.entailment)
    if (contradiction >= CONTRADICTION_PROBABILITY) {
      this.publish(false, similarity, 'nli-contradiction')
      return
    }
    if (entailment >= ENTAILMENT_PROBABILITY) {
      this.publish(true, similarity, 'nli-entailment')
      return
    }
    // Neither entailed nor contradicted. Cosine breaks the tie, at the strict
    // end of the range, so an undecided pair only passes when the wording is
    // near-identical.
    this.publish(similarity >= high, similarity, 'nli-neutral')
  }

  static register(): void {
    LiteGraph.registerNodeType(
      SemanticEquivalenceNode.path,
      SemanticEquivalenceNode
    )
  }
}
