/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { WebSocket } from 'ws'

import { LGraphNode, LiteGraph } from './litegraph-extensions'

/**
 * Cosine Similaritys
 */
export class SentenceTransformer extends LGraphNode {
  env: Record<string, unknown>
  constructor() {
    super()
    // https://platform.openai.com/docs/api-reference/chat/create

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

  setWebSocket(_ws: WebSocket): void {
    this.ws = _ws
  }

  async init(_env: Record<string, unknown>) {
    this.env = _env
  }

  //name of the function to call when executing
  async onExecute() {
    // TODO: sanity check input

    // fetch from server
    console.log(this.env.SIMILARITY_WORKER_URL)
    const url =
      (this.env.SIMILARITY_WORKER_URL ?? 'http://193.174.195.36:8002') +
      '/sentence_embedding'
    console.log('URL: ', url)

    const response_one = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sentence: this.getInputData(0)
      })
    })
    if (!response_one.ok) {
      throw new Error('Network response was not ok')
    }

    // get response
    const embedding_one = await response_one.json()

    //send output to the output
    this.setOutputData(0, embedding_one)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(SentenceTransformer.path, SentenceTransformer)
  }
}
