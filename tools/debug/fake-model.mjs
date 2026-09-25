import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 8000)
const modelId = 'nodegrade-deterministic'

function json(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString()))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

const DIMENSIONS = 128

/**
 * Deterministic, and — unlike the version this replaces — actually
 * discriminative.
 *
 * The first attempt summed character codes into eight buckets by position. Every
 * English sentence of similar length then pointed almost the same way: two
 * unrelated sentences scored 0.99, which sailed past the 0.92 ceiling in
 * `text/semantic-equivalence` and made the debug stack answer "equivalent" to
 * anything. A stub that is deterministic and wrong is worse than no stub.
 *
 * Hashed bag of words instead. Identical text scores 1, shared vocabulary scores
 * in between, disjoint vocabulary scores near 0. It is not a language model and
 * makes no attempt to be one: paraphrases score low here and high on a real
 * worker. It exists so the plumbing is exercised with numbers that behave.
 */
function tokenize(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** FNV-1a, for a bucket that is stable across processes and Node versions. */
function hash(token) {
  let value = 0x811c9dc5
  for (let index = 0; index < token.length; index++) {
    value ^= token.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value
}

function embedding(value) {
  const vector = new Array(DIMENSIONS).fill(0)
  const tokens = tokenize(value)
  for (const token of tokens) {
    vector[hash(token) % DIMENSIONS] += 1
    // A second bucket from the token's first three characters keeps related
    // word forms ("rotate"/"rotates") from being strictly orthogonal.
    vector[hash(token.slice(0, 3)) % DIMENSIONS] += 0.5
  }
  // An empty or punctuation-only input still has to return a unit vector, or
  // cosine divides by zero and every caller sees NaN.
  if (tokens.length === 0) vector[0] = 1
  const magnitude = Math.sqrt(vector.reduce((sum, entry) => sum + entry ** 2, 0))
  return vector.map((entry) => entry / magnitude)
}

function cosine(a, b) {
  return a.reduce((sum, entry, index) => sum + entry * b[index], 0)
}

const NEGATIONS = new Set([
  'no',
  'not',
  'never',
  'nicht',
  'kein',
  'keine',
  'nein',
  'false',
  'falsch',
  'incorrect'
])

/**
 * A stand-in verdict for `/entailment`, derived from overlap and negation.
 *
 * Answering 503 here was the earlier choice, so the browser suite would exercise
 * the `nli-unavailable` fallback. That fallback hands the decision to the cosine
 * ceiling, which is exactly the path that produced wrong verdicts — the debug
 * stack ended up demonstrating the bug rather than the feature. Deciding here
 * keeps the cascade intact; set `DEBUG_NLI_DISABLED=1` to get the 503 back and
 * test the fallback deliberately.
 */
function entailmentScores(premise, hypothesis) {
  const left = new Set(tokenize(premise))
  const right = new Set(tokenize(hypothesis))
  const shared = [...left].filter((token) => right.has(token)).length
  const union = new Set([...left, ...right]).size || 1
  const overlap = shared / union
  const negated = (side) => [...side].some((token) => NEGATIONS.has(token))
  if (negated(left) !== negated(right) && overlap > 0.2)
    return { entailment: 0.02, neutral: 0.05, contradiction: 0.93 }
  if (overlap >= 0.8) return { entailment: 0.95, neutral: 0.04, contradiction: 0.01 }
  // Deliberately below the node's 0.6 entailment threshold: shared vocabulary is
  // not shared meaning, and a stub that cannot read has no business claiming it
  // is. "The reaction is exothermic" and "... endothermic" overlap 0.75.
  if (overlap >= 0.45) return { entailment: 0.55, neutral: 0.41, contradiction: 0.04 }
  if (overlap >= 0.2) return { entailment: 0.25, neutral: 0.68, contradiction: 0.07 }
  return { entailment: 0.05, neutral: 0.8, contradiction: 0.15 }
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    json(response, 200, { status: 'ok', service: 'nodegrade-deterministic-model' })
    return
  }

  if (request.method === 'GET' && request.url === '/v1/models') {
    json(response, 200, {
      object: 'list',
      data: [{ id: modelId, object: 'model', owned_by: 'nodegrade-debug' }]
    })
    return
  }

  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    try {
      const body = await readBody(request)
      json(response, 200, {
        id: 'debug-completion-1',
        object: 'chat.completion',
        created: 1,
        model: typeof body.model === 'string' ? body.model : modelId,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'score: 100\nfeedback: Deterministic debug response.'
            }
          }
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 8,
          total_tokens: 12
        }
      })
    } catch {
      json(response, 400, { error: { message: 'Request body must be valid JSON.' } })
    }
    return
  }

  if (request.method === 'POST' && request.url === '/sentence_embedding') {
    try {
      const body = await readBody(request)
      if (Array.isArray(body.sentence)) {
        json(response, 200, body.sentence.map((entry) => embedding(String(entry))))
        return
      }
      const sentence = typeof body.sentence === 'string' ? body.sentence : ''
      json(response, 200, embedding(sentence))
    } catch {
      json(response, 400, { error: { message: 'Request body must be valid JSON.' } })
    }
    return
  }

  if (request.method === 'POST' && request.url === '/similarity') {
    try {
      const body = await readBody(request)
      const source = embedding(typeof body.source === 'string' ? body.source : '')
      const targets = Array.isArray(body.targets) ? body.targets : []
      json(response, 200, {
        model: 'nodegrade-deterministic-embedding',
        scores: targets.map((target) =>
          cosine(source, embedding(String(target)))
        )
      })
    } catch {
      json(response, 400, { error: { message: 'Request body must be valid JSON.' } })
    }
    return
  }

  if (request.method === 'POST' && request.url === '/entailment') {
    // The production answer when NLI_MODEL is empty, kept behind a flag so the
    // `nli-unavailable` fallback stays testable on purpose rather than by
    // accident.
    if (process.env.DEBUG_NLI_DISABLED === '1') {
      json(response, 503, { error: 'NLI model is disabled (NLI_MODEL is empty)' })
      return
    }
    try {
      const body = await readBody(request)
      const pairs = Array.isArray(body.pairs)
        ? body.pairs
        : typeof body.premise === 'string' && typeof body.hypothesis === 'string'
          ? [[body.premise, body.hypothesis]]
          : null
      if (!pairs) {
        json(response, 400, {
          error: { message: 'Send {premise, hypothesis} or {pairs: [[p, h]]}.' }
        })
        return
      }
      json(response, 200, {
        model: 'nodegrade-deterministic-nli',
        results: pairs.map(([premise, hypothesis]) => {
          const scores = entailmentScores(String(premise), String(hypothesis))
          const label = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
          return { ...scores, label }
        })
      })
    } catch {
      json(response, 400, { error: { message: 'Request body must be valid JSON.' } })
    }
    return
  }

  json(response, 404, { error: { message: 'Unknown debug-model endpoint.' } })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Deterministic model listening on http://0.0.0.0:${port}`)
})
