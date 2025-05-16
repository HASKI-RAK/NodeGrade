/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphCanvas, Vector2 } from 'litegraph.js'

import { LGraphNode } from './litegraph-extensions'

type TfIdfTuple = [number, number, number]
type TfIdfRecord = Record<string, TfIdfTuple>

export class TFIDF extends LGraphNode {
  constructor() {
    super()
    this.addIn('string') // correct answer
    this.addIn('string') // corpus

    this.addOut('*')
    this.title = 'TF-IDF'
    this.size = [200, 100]
  }
  //name of the node
  static title = 'tf-idf'
  static path = 'basic/tf-idf'
  static getPath(): string {
    return TFIDF.path
  }

  //name of the function to call when executing
  async onExecute() {
    const correctAnswer = this.getInputData(0)
    const corpus = [this.getInputData(1)]
    if (!correctAnswer || !corpus) {
      return
    }
    const tfIdfRecord = this.calculateTfIdf(correctAnswer, corpus)
    this.properties.value = JSON.stringify(tfIdfRecord)
    console.log('TF-IDF: ', tfIdfRecord)

    this.setOutputData(0, this.properties.value)
  }

  private calculateTfIdf(correctAnswer: string, corpus: string[]): TfIdfRecord {
    const words = correctAnswer.toLowerCase().match(/\w+/g) || []
    const wordCount = words.length
    const wordFrequencies = new Map<string, number>()

    // Calculate TF (Term Frequency)
    words.forEach((word) => {
      wordFrequencies.set(word, (wordFrequencies.get(word) ?? 0) + 1)
    })

    // Calculate IDF (Inverse Document Frequency)
    const idfValues = new Map<string, number>()
    corpus.forEach((doc) => {
      const uniqueWords = new Set(doc.toLowerCase().match(/\w+/g))
      uniqueWords.forEach((word) => {
        idfValues.set(word, (idfValues.get(word) ?? 0) + 1)
      })
    })

    // Calculate TF-IDF and build the record
    const tfIdfRecord: TfIdfRecord = {}
    wordFrequencies.forEach((freq, word) => {
      const tf = freq / wordCount
      const idf = Math.log(corpus.length / (1 + (idfValues.get(word) ?? 0)))
      const tfIdf = tf * idf
      tfIdfRecord[word] = [tf, idf, tfIdf]
    })

    return tfIdfRecord
  }
}
