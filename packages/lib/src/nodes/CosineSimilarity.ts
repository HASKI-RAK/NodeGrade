/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'

/**
 * Cosine Similaritys
 */
export class CosineSimilarity extends LGraphNode {
  constructor() {
    super()
    // https://platform.openai.com/docs/api-reference/chat/create

    this.addIn('[number]')
    this.addIn('[number]')

    this.addOut('number')
    this.properties = {
      value: -1
    }
    this.title = 'Cosine Similarity'
  }

  //name of the node
  static title = 'Cosine Similarity'
  static path = 'models/cosine-similarity'

  static getPath(): string {
    return CosineSimilarity.path
  }

  // Calculates cosine similarity between two arrays of numbers
  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  //name of the function to call when executing
  async onExecute() {
    // Calculate cosine similarity
    const input_one = this.getInputData(0)
    const input_two = this.getInputData(1)
    if (input_one && input_two) {
      const similarity = this.cosineSimilarity(input_one, input_two)
      this.setOutputData(0, similarity)
    }
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(CosineSimilarity.path, CosineSimilarity)
  }
}
