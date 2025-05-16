/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'

/**
 * KeywordCheckNode
 * Inputs: keywords (comma-separated string), text (string)
 * Outputs: presentKeywords (comma-separated string), missingKeywords (comma-separated string)
 * Property: useSemantic (boolean toggle)
 */
export class KeywordCheckNode extends LGraphNode {
  properties: {
    useSemantic: boolean
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
    this.properties = {
      useSemantic: false,
      presentKeywords: 'array',
      missingKeywords: 'text'
    }
    this.title = 'Keyword Check'
    this.serialize_widgets = true
  }

  static title = 'Keyword Check'
  static path = 'text/keyword-check'
  static getPath(): string {
    return KeywordCheckNode.path
  }

  async onExecute() {
    const keywordsInput = this.getInputData(0)
    const textInput = this.getInputData(1)
    const useSemantic = this.properties.useSemantic

    const keywords = keywordsInput
      .split(',')
      .map((k: any) => k.trim())
      .filter(Boolean)
    const text = textInput.toLowerCase()
    const present: string[] = []
    const missing: string[] = []
    if (!useSemantic) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          present.push(keyword)
        } else {
          missing.push(keyword)
        }
      }
      this.setOutputData(0, present.join(', '))
      this.setOutputData(1, missing.join(', '))
      this.properties.presentKeywords = present.join(', ')
      this.properties.missingKeywords = missing.join(', ')
    } else {
      // Semantic similarity: call model worker for each keyword
      const SIMILARITY_WORKER_URL =
        (this.env && this.env.SIMILARITY_WORKER_URL) || 'http://193.174.195.36:8002'
      const threshold = 0.7
      // Helper to fetch embedding
      async function fetchEmbedding(sentence: string): Promise<number[]> {
        const response = await fetch(`${SIMILARITY_WORKER_URL}/sentence_embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentence })
        })
        if (!response.ok) throw new Error('Failed to fetch embedding')
        return await response.json()
      }
      // Helper to compute cosine similarity
      function cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0,
          normA = 0,
          normB = 0
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i]
          normA += a[i] * a[i]
          normB += b[i] * b[i]
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB))
      }
      // Get embedding for the text
      const textEmbedding = await fetchEmbedding(textInput)
      // For each keyword, get embedding and compare
      for (const keyword of keywords) {
        try {
          const keywordEmbedding = await fetchEmbedding(keyword)
          const sim = cosineSimilarity(keywordEmbedding, textEmbedding)
          if (sim >= threshold) {
            present.push(keyword)
          } else {
            missing.push(keyword)
          }
        } catch (e) {
          // On error, treat as missing
          missing.push(keyword)
        }
      }
      this.setOutputData(0, present.join(', '))
      this.setOutputData(1, missing.join(', '))
      this.properties.presentKeywords = present.join(', ')
      this.properties.missingKeywords = missing.join(', ')
    }
  }

  static register() {
    LiteGraph.registerNodeType(KeywordCheckNode.path, KeywordCheckNode)
  }
}
