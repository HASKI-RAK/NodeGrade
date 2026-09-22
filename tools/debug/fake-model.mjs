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

function embedding(value) {
  const vector = Array.from({ length: 8 }, () => 1)
  for (const [index, character] of [...value].entries()) {
    vector[index % vector.length] += character.codePointAt(0) ?? 0
  }
  const magnitude = Math.sqrt(vector.reduce((sum, entry) => sum + entry ** 2, 0))
  return vector.map((entry) => entry / magnitude)
}

function cosine(a, b) {
  return a.reduce((sum, entry, index) => sum + entry * b[index], 0)
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

  // No entailment model in the debug stack. 503 is the production answer when
  // NLI_MODEL is empty, and the one `text/semantic-equivalence` is built to
  // survive, so the browser suite exercises that fallback rather than a
  // fabricated verdict.
  if (request.method === 'POST' && request.url === '/entailment') {
    json(response, 503, { error: 'NLI model is disabled (NLI_MODEL is empty)' })
    return
  }

  json(response, 404, { error: { message: 'Unknown debug-model endpoint.' } })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Deterministic model listening on http://0.0.0.0:${port}`)
})
