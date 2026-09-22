/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'
import { fetchEmbedding, resolveSimilarityWorkerUrl } from './utils/similarityWorker'

/**
 * Embeds a string with the NLP worker's sentence-transformer model.
 *
 * The vector this emits is only meaningful next to another vector from the same
 * model, so it exists to feed `models/cosine-similarity`. What that pair
 * measures is relatedness, not correctness — see `text/semantic-equivalence`
 * for the decision that needs more than one number.
 */
export class SentenceTransformer extends LGraphNode {
  env: Record<string, unknown>
  constructor() {
    super()
    this.addIn('string')

    this.addOut('[number]')
    this.properties = {
      value: -1
    }
    this.title = 'Sentence Transformer'
    this.env = {}
  }

  //name of the node
  static title = 'Sentence Transformer'
  static path = 'models/sentence-transformer'
  static getPath(): string {
    return SentenceTransformer.path
  }

  async init(_env: Record<string, unknown>) {
    this.env = _env
  }

  //name of the function to call when executing
  async onExecute() {
    const embedding = await fetchEmbedding(
      resolveSimilarityWorkerUrl(this.env),
      String(this.getInputData(0) ?? ''),
      this.executionSignal
    )
    this.setOutputData(0, embedding)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(SentenceTransformer.path, SentenceTransformer)
  }
}
