/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'
import { normalizeAnswer, splitIntoSpans } from './utils/semanticEquivalence'
import { fetchSimilarities, resolveSimilarityWorkerUrl } from './utils/similarityWorker'

/**
 * The cutoff a keyword has to clear against its best-matching sentence. Lower
 * than the old hardcoded 0.7: a single word rarely reaches 0.7 against a
 * sentence even when the sentence plainly expresses it.
 */
export const DEFAULT_KEYWORD_THRESHOLD = 0.6

/**
 * KeywordCheckNode
 * Inputs: keywords (comma-separated string), text (string)
 * Outputs: presentKeywords (comma-separated string), missingKeywords (comma-separated string)
 * Properties: useSemantic (boolean toggle), threshold (similarity cutoff)
 */
export class KeywordCheckNode extends LGraphNode {
  properties: {
    useSemantic: boolean
    threshold: number
    presentKeywords: string
    missingKeywords: string
  }
  constructor() {
    super()
    this.addIn('string', 'keywords (comma-separated)')
    this.addIn('string', 'text')
    this.addOut('string', 'present keywords')
    this.addOut('string', 'missing keywords')
    this.addWidget('toggle', 'use semantic similarity', false, (v) => {
      this.properties.useSemantic = v
    })
    this.addWidget(
      'slider',
      'similarity threshold',
      DEFAULT_KEYWORD_THRESHOLD,
      (v: number) => {
        this.properties.threshold = v
      },
      { min: 0, max: 1, step: 0.01, precision: 2 }
    )
    this.properties = {
      useSemantic: false,
      threshold: DEFAULT_KEYWORD_THRESHOLD,
      presentKeywords: '',
      missingKeywords: ''
    }
    this.title = 'Keyword Check'
    this.serialize_widgets = true
  }

  static title = 'Keyword Check'
  static path = 'text/keyword-check'
  static getPath(): string {
    return KeywordCheckNode.path
  }

  /**
   * Both lists keep the order the keywords were given in. The semantic pass
   * settles them out of order — literal matches first, then whatever the worker
   * answers about — and a facilitator reading the output should not have to
   * work out why.
   */
  private publish(keywords: readonly string[], present: ReadonlySet<string>) {
    const inOrder = (wanted: boolean) =>
      keywords.filter((keyword) => present.has(keyword) === wanted).join(', ')
    const found = inOrder(true)
    const absent = inOrder(false)
    this.setOutputData(0, found)
    this.setOutputData(1, absent)
    this.properties.presentKeywords = found
    this.properties.missingKeywords = absent
  }

  async onExecute() {
    const keywordsInput = this.getInputData(0)
    const textInput = this.getInputData(1)
    const useSemantic = this.properties.useSemantic

    const keywords: string[] = String(keywordsInput ?? '')
      .split(',')
      .map((k: string) => k.trim())
      .filter(Boolean)
    const text = String(textInput ?? '')
    const lowerText = text.toLowerCase()

    // A keyword that literally appears is present under either mode. Running
    // the lexical test first in semantic mode is not an optimisation: an
    // embedding can score a keyword below threshold against the very sentence
    // that spells it out, and no grader would accept that as "missing".
    const present = new Set<string>()
    const unmatched: string[] = []
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) present.add(keyword)
      else unmatched.push(keyword)
    }

    if (!useSemantic || unmatched.length === 0 || !normalizeAnswer(text)) {
      this.publish(keywords, present)
      return
    }

    // One keyword against the whole answer is a diluted comparison: the
    // keyword's meaning is a fraction of the vector it meets. Scoring against
    // each sentence and keeping the best score removes that dilution, and one
    // request per keyword covers every span at once.
    const workerUrl = resolveSimilarityWorkerUrl(this.env)
    const spans = splitIntoSpans(text)
    const threshold = this.properties.threshold ?? DEFAULT_KEYWORD_THRESHOLD
    for (const keyword of unmatched) {
      try {
        const scores = await fetchSimilarities(
          workerUrl,
          keyword,
          spans,
          this.executionSignal
        )
        const best = scores.length > 0 ? Math.max(...scores) : 0
        if (best >= threshold) present.add(keyword)
      } catch (error) {
        if (this.executionSignal?.aborted) throw error
        // An unreachable worker leaves the keyword missing rather than present:
        // a failed check must not report coverage nobody verified.
      }
    }
    this.publish(keywords, present)
  }

  static register() {
    LiteGraph.registerNodeType(KeywordCheckNode.path, KeywordCheckNode)
  }
}
