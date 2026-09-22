/**
 * Client for the NLP worker in `models/model_worker.py`.
 *
 * Two nodes talk to that service and both used to inline their own `fetch`,
 * their own cosine and their own hardcoded address. They also paid one request
 * per comparison: `/similarity` scores a source against every target in a
 * single forward pass, which is one round trip instead of N + 1.
 *
 * Every call degrades rather than fails: a worker that predates `/similarity`
 * still answers `/sentence_embedding`, and one without an entailment model
 * answers 503, which the callers read as "no verdict" instead of an error.
 */

/** The worker address used before SIMILARITY_WORKER_URL was injected. */
export const FALLBACK_SIMILARITY_WORKER_URL = 'http://193.174.195.36:8002'

export type EntailmentLabel = 'entailment' | 'neutral' | 'contradiction'

export type EntailmentScores = {
  entailment: number
  neutral: number
  contradiction: number
  label: EntailmentLabel
}

export type WorkerPair = readonly [premise: string, hypothesis: string]

/** The worker address for a node, falling back to the pre-injection default. */
export function resolveSimilarityWorkerUrl(
  env: Record<string, unknown> | undefined
): string {
  const configured = env?.SIMILARITY_WORKER_URL
  const url = typeof configured === 'string' && configured ? configured : undefined
  return (url ?? FALLBACK_SIMILARITY_WORKER_URL).replace(/\/+$/, '')
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index]
    normA += a[index] * a[index]
    normB += b[index] * b[index]
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dot / magnitude
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
}

async function postJson(
  url: string,
  body: unknown,
  signal: AbortSignal | undefined
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

/** Embed one sentence. Throws when the worker is unreachable or answers nonsense. */
export async function fetchEmbedding(
  workerUrl: string,
  sentence: string,
  signal?: AbortSignal
): Promise<number[]> {
  const response = await postJson(`${workerUrl}/sentence_embedding`, { sentence }, signal)
  if (!response.ok) throw new Error('Failed to fetch embedding')
  const embedding: unknown = await response.json()
  if (!isNumberArray(embedding))
    throw new Error('Model worker returned an invalid embedding')
  return embedding
}

/**
 * Cosine of `source` against each target, in target order.
 *
 * Prefers the worker's `/similarity` endpoint. A worker deployed before that
 * endpoint existed answers 404/405, so the embeddings are fetched individually
 * and compared here instead — slower, same numbers.
 */
export async function fetchSimilarities(
  workerUrl: string,
  source: string,
  targets: readonly string[],
  signal?: AbortSignal
): Promise<number[]> {
  if (targets.length === 0) return []
  try {
    const response = await postJson(
      `${workerUrl}/similarity`,
      { source, targets },
      signal
    )
    if (response.ok) {
      const payload: unknown = await response.json()
      const scores = (payload as { scores?: unknown })?.scores
      if (isNumberArray(scores) && scores.length === targets.length) return scores
    }
  } catch (error) {
    if (signal?.aborted) throw error
    // Fall through to the per-embedding path below.
  }
  const sourceEmbedding = await fetchEmbedding(workerUrl, source, signal)
  const scores: number[] = []
  for (const target of targets) {
    const targetEmbedding = await fetchEmbedding(workerUrl, target, signal)
    scores.push(cosineSimilarity(sourceEmbedding, targetEmbedding))
  }
  return scores
}

function toEntailmentScores(value: unknown): EntailmentScores | undefined {
  const row = value as Partial<Record<EntailmentLabel | 'label', unknown>>
  const entailment = row?.entailment
  const neutral = row?.neutral
  const contradiction = row?.contradiction
  const label = row?.label
  if (
    typeof entailment !== 'number' ||
    typeof neutral !== 'number' ||
    typeof contradiction !== 'number' ||
    (label !== 'entailment' && label !== 'neutral' && label !== 'contradiction')
  )
    return undefined
  return { entailment, neutral, contradiction, label }
}

/**
 * Classify premise/hypothesis pairs, or `undefined` when this worker has no
 * entailment model. The caller decides what "no verdict" means; for grading it
 * means falling back to the cosine band alone rather than failing the run.
 */
export async function fetchEntailment(
  workerUrl: string,
  pairs: readonly WorkerPair[],
  signal?: AbortSignal
): Promise<EntailmentScores[] | undefined> {
  if (pairs.length === 0) return []
  try {
    const response = await postJson(
      `${workerUrl}/entailment`,
      { pairs: pairs.map(([premise, hypothesis]) => [premise, hypothesis]) },
      signal
    )
    if (!response.ok) return undefined
    const payload: unknown = await response.json()
    const results = (payload as { results?: unknown })?.results
    if (!Array.isArray(results) || results.length !== pairs.length) return undefined
    const scores = results.map(toEntailmentScores)
    return scores.every((score): score is EntailmentScores => score !== undefined)
      ? scores
      : undefined
  } catch (error) {
    if (signal?.aborted) throw error
    return undefined
  }
}
