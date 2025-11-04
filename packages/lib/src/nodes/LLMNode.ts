/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'
import { PromptMessageType } from './types/NodeLinkMessage'
import { OpenAiApiResponse, OpenAiModel } from './types/OpenAiApi'

/**
 * Language Model node
 */
export class LLMNode extends LGraphNode {
  env: Record<string, unknown>
  widget_llm: any
  models: string[] = []
  // track model sources to route execution
  private openAiModelSet: Set<string> = new Set()
  private localModelSet: Set<string> = new Set()

  constructor() {
    super()
    // https://platform.openai.com/docs/api-reference/chat/create
    // this.models = ['Wizard-Vicuna-30B-Uncensored']
    // both inputs are optional. if message is not set, messages will be used
    this.addIn('message')
    // both inputs are optional
    this.addIn('*', 'messages')
    this.addWidget(
      'number',
      'max_tokens',
      this.properties.max_tokens ?? 64,
      (value: number) => {
        this.properties.max_tokens = value
      },
      { min: 0, max: 2048, step: 1, precision: 0 }
    )
    this.addWidget(
      'slider',
      'temperature',
      this.properties.temperature ?? 0.4,
      function (value, widget, node) {
        node.properties.temperature = value
      },
      { min: 0, max: 1, step: 0.01, precision: 2 }
    )
    this.addWidget(
      'slider',
      'top_p',
      this.properties.top_p ?? 1,
      function (value, widget, node) {
        node.properties.top_p = value
      },
      { min: 0, max: 1, step: 0.01, precision: 2 }
    )
    this.addWidget(
      'slider',
      'top_k',
      this.properties.top_k ?? 50,
      function (value, widget, node) {
        node.properties.top_k = value
      },
      { min: 1, max: 200, step: 1, precision: 0 }
    )
    this.addWidget(
      'slider',
      'presence_penalty',
      this.properties.presence_penalty ?? 0,
      function (value, widget, node) {
        node.properties.presence_penalty = value
      },
      { min: -2.0, max: 2.0, step: 0.1, precision: 1 }
    )
    this.addWidget(
      'slider',
      'repetition_penalty',
      this.properties.repetition_penalty ?? 0,
      function (value, widget, node) {
        node.properties.repetition_penalty = value
      },
      { min: -2.0, max: 2.0, step: 0.1, precision: 1 }
    )
    this.addWidget(
      'number',
      'repetition_penalty_range',
      this.properties.repetition_penalty_range ?? 512,
      (value, widget, node) => {
        node.properties.repetition_penalty_range = value
      },
      { min: 0, max: 2048, step: 1, precision: 0 }
    )
    this.addWidget(
      'slider',
      'guidance_scale',
      this.properties.guidance_scale ?? 1,
      (value, widget, node) => {
        node.properties.guidance_scale = value
      },
      { min: 0, max: 2, step: 0.1, precision: 1 }
    )
    this.widget_llm = this.addWidget(
      'combo',
      'model',
      this.properties.model ?? this.models[0],
      (value, widget, node) => {
        node.properties.model = value
      },
      {
        values: this.models
      }
    )
    this.serialize_widgets = true
    this.addOut('string')
    this.properties = {
      value: '',
      model: '',
      temperature: 0.4,
      max_tokens: 64,
      top_p: 1,
      top_k: 1,
      presence_penalty: 0,
      repetition_penalty: 0,
      repetition_penalty_range: 512,
      guidance_scale: 1,
      // carry available models in serializable properties so frontend can populate the widget
      available_models: [],
      // map model id -> source ("local" | "openai") to persist across serialization
      available_model_sources: {}
    }
    this.title = 'LLM'
    this.env = {}
  }

  //name of the node
  static title = 'LLM'
  static path = 'models/llm'
  static getPath(): string {
    return LLMNode.path
  }

  // onAdded(_: LGraph): void {
  //   // this.initModels(['Wizard-Vicuna-30B-Uncensored'])
  // }

  async init(_env: Record<string, unknown>) {
    this.env = _env
    // Only fetch models if we're running on the backend (node has fetch in env or is in Node.js)
    // Frontend nodes will get models from serialized properties
    if (globalThis.window === undefined) {
      try {
        const fetches: Promise<string[]>[] = []
        const sources: Array<'local' | 'openai'> = []

        if (this.env.MODEL_WORKER_URL) {
          fetches.push(
            this.fetchModels((this.env.MODEL_WORKER_URL as string) + '/v1/models')
          )
          sources.push('local')
        }

        const openaiKey = this.env.OPENAI_API_KEY as string | undefined
        if (openaiKey) {
          fetches.push(this.fetchOpenAiModels(openaiKey))
          sources.push('openai')
        }

        if (fetches.length === 0) return

        const results = await Promise.allSettled(fetches)
        const merged: string[] = []
        const sourceMap: Record<string, 'local' | 'openai'> = {}

        results.forEach((res, idx) => {
          if (res.status === 'fulfilled') {
            const provider = sources[idx]
            for (const id of res.value) {
              if (!merged.includes(id)) merged.push(id)
              sourceMap[id] = provider
              if (provider === 'openai') this.openAiModelSet.add(id)
              else this.localModelSet.add(id)
            }
          }
        })

        this.initModels(merged, sourceMap)
      } catch (error) {
        console.error('Failed to fetch models:', error)
      }
    }
  }

  initModels(models: string[], sourceMap?: Record<string, 'local' | 'openai'>) {
    this.models = models
    // store also in properties so it survives serialization to the frontend
    // eslint-disable-next-line immutable/no-mutation
    ;(this.properties as any).available_models = models
    if (sourceMap) {
      // eslint-disable-next-line immutable/no-mutation
      ;(this.properties as any).available_model_sources = sourceMap
    }
    this.widget_llm.options = { values: this.models }
    // check if old model is still available, otherwise set to first model
    if (!this.models.includes(this.properties.model)) {
      this.properties.model = this.models[0]
      this.widget_llm.value = this.models[0]
    }
  }

  async fetchModels(endpoint: string): Promise<string[]> {
    try {
      // Fetch the data from the specified endpoint

      const response = await fetch(endpoint, {
        method: 'GET'
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: OpenAiApiResponse = await response.json()

      // Ensure the data format is as expected
      if (data.object !== 'list' || !Array.isArray(data.data)) {
        throw new Error('Invalid data format')
      }

      // Extract model IDs from the data
      const modelIds = data.data.map((model: OpenAiModel) => model.id)

      return modelIds
    } catch (error) {
      console.error('Failed to fetch models:', error)
      return []
    }
  }

  private async fetchOpenAiModels(apiKey: string): Promise<string[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: OpenAiApiResponse = (await response.json()) as OpenAiApiResponse
      if (data.object !== 'list' || !Array.isArray(data.data)) {
        throw new Error('Invalid data format from OpenAI')
      }
      return data.data.map((m: OpenAiModel) => m.id)
    } catch (err) {
      console.error('Failed to fetch OpenAI models:', err)
      return []
    }
  }

  private isOpenAiModel(modelId: string): boolean {
    if (this.openAiModelSet.has(modelId)) return true
    const src = (this.properties as any).available_model_sources?.[modelId]
    return src === 'openai'
  }

  private async executeOpenAi(
    model: string,
    messages: PromptMessageType[] | undefined,
    apiKey: string
  ): Promise<string> {
    // Build body compatible with OpenAI Responses API
    const body: Record<string, unknown> = {
      model,
      input: messages ?? []
    }
    if (typeof this.properties.temperature === 'number') {
      body.temperature = this.properties.temperature
    }
    if (typeof this.properties.top_p === 'number') {
      body.top_p = this.properties.top_p
    }
    if (typeof this.properties.max_tokens === 'number') {
      body.max_completion_tokens = this.properties.max_tokens
    }
    // Note: Responses API may not accept presence_penalty; omit here

    // Try the modern Responses API with retry loop for parameter errors
    let response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    })

    // Retry loop: remove problematic parameters one by one (max 10 attempts)
    const maxRetries = 10
    let retryCount = 0
    while (!response.ok && response.status === 400 && retryCount < maxRetries) {
      const errorText = await response.text().catch(() => '')
      let errorData: any = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        // ignore parse errors
        break
      }

      // Extract the problematic parameter from error message
      const badParam = errorData?.error?.param as string | undefined
      if (badParam && body[badParam] !== undefined) {
        console.warn(
          `OpenAI rejected parameter '${badParam}', retrying without it: ${errorData?.error?.message || ''}`
        )
        delete body[badParam]
        retryCount++

        // Retry Responses API without the bad parameter
        response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        })
      } else {
        // No param to remove, stop retrying
        break
      }
    }

    // If not available or still invalid params, fallback to legacy chat/completions
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      const legacyBody: Record<string, unknown> = {
        model,
        messages,
        temperature: this.properties.temperature,
        top_p: this.properties.top_p,
        // some newer models require max_completion_tokens even on chat/completions
        max_completion_tokens: this.properties.max_tokens,
        presence_penalty: this.properties.presence_penalty
      }
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(legacyBody)
      })

      // Retry loop for legacy endpoint too
      let legacyRetryCount = 0
      while (!response.ok && response.status === 400 && legacyRetryCount < maxRetries) {
        const errorText = await response.text().catch(() => '')
        let errorData: any = {}
        try {
          errorData = JSON.parse(errorText)
        } catch {
          break
        }

        const badParam = errorData?.error?.param as string | undefined
        if (badParam && legacyBody[badParam] !== undefined) {
          console.warn(
            `OpenAI legacy rejected parameter '${badParam}', retrying without it: ${errorData?.error?.message || ''}`
          )
          delete legacyBody[badParam]
          legacyRetryCount++

          response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(legacyBody)
          })
        } else {
          break
        }
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        `OpenAI request failed: ${response.status} ${response.statusText} ${text}`
      )
    }

    const data: any = await response.json()

    // Add debug logging to understand response structure
    console.log('OpenAI response structure:', JSON.stringify(data).substring(0, 500))

    // Prefer output_text if present (Responses API)
    if (typeof data?.output_text === 'string' && data.output_text.length) {
      return data.output_text
    }
    // Try to aggregate textual outputs (Responses API array format)
    if (Array.isArray(data?.output)) {
      const parts: string[] = []
      for (const item of data.output) {
        if (typeof item?.content === 'string') parts.push(item.content)
        else if (Array.isArray(item?.content)) {
          for (const c of item.content) {
            if (typeof c?.text === 'string') parts.push(c.text)
          }
        }
      }
      if (parts.length) return parts.join('')
    }
    // Legacy chat/completions style
    if (Array.isArray(data?.choices) && data.choices.length > 0) {
      const firstChoice = data.choices[0]
      // Handle both message.content and text formats (allow empty strings)
      if (firstChoice?.message?.content !== undefined) {
        return firstChoice.message.content as string
      }
      if (typeof firstChoice?.text === 'string') {
        return firstChoice.text
      }
    }
    // Fallback: check if there's any text-like content we can extract
    if (data?.content !== undefined && typeof data.content === 'string') {
      return data.content
    }
    if (data?.text !== undefined && typeof data.text === 'string') {
      return data.text
    }

    // Log the full response for debugging before failing
    console.error(
      'Failed to parse OpenAI response. Full data:',
      JSON.stringify(data, null, 2)
    )
    throw new Error('OpenAI response parsing failed - no recognized content field found')
  }

  //name of the function to call when executing
  async onExecute() {
    // Only execute on the backend - frontend nodes should never call this
    if (typeof window !== 'undefined') {
      throw new Error('LLMNode can only execute on the backend')
    }

    //get inputs
    const message = this.getInputData<PromptMessageType | undefined>(0)
    const messages = this.getInputData<PromptMessageType[] | undefined>(1)
    const selectedModel = this.properties.model

    // If model belongs to OpenAI and key is present, route to OpenAI
    const openaiKey = this.env.OPENAI_API_KEY as string | undefined
    if (openaiKey && this.isOpenAiModel(selectedModel)) {
      const content = await this.executeOpenAi(
        selectedModel,
        message ? [message] : messages,
        openaiKey
      )
      this.properties.value = content
      this.setOutputData(0, content)
      return
    }

    // Default: local model worker (OpenAI-compatible proxy)
    const input = {
      model: selectedModel,
      messages: message ? [message] : messages,
      max_tokens: this.properties.max_tokens,
      temperature: this.properties.temperature,
      top_p: this.properties.top_p,
      top_k: this.properties.top_k,
      presence_penalty: this.properties.presence_penalty,
      repetition_penalty: this.properties.repetition_penalty,
      repetition_penalty_range: this.properties.repetition_penalty_range,
      guidance_scale: this.properties.guidance_scale
    }
    const required_input = JSON.stringify(input)
    const workerUrl =
      (this.env.MODEL_WORKER_URL as string) ?? 'http://193.174.195.36:8000'

    const response = await fetch(workerUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: required_input
    })
    if (!response.ok) {
      console.error(`LLM API error: ${response.statusText}`)
      throw new Error(`LLM API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const choices = data.choices
    this.properties.value = choices[0].message.content
    this.setOutputData(0, choices[0].message.content)
  }

  // ensure that when a node is configured (e.g. on the frontend after receiving a serialized graph)
  // the combo widget gets its values from the serialized properties
  onConfigure(o: unknown): void {
    const available = (this.properties as any).available_models as string[] | undefined
    if (Array.isArray(available) && available.length) {
      this.models = available
      // reconstruct model source sets from serialized map if available
      const srcMap = (this.properties as any).available_model_sources as
        | Record<string, 'local' | 'openai'>
        | undefined
      this.openAiModelSet = new Set()
      this.localModelSet = new Set()
      if (srcMap) {
        for (const [id, src] of Object.entries(srcMap)) {
          if (src === 'openai') this.openAiModelSet.add(id)
          else this.localModelSet.add(id)
        }
      }
      this.widget_llm.options = { values: this.models }
      if (!this.models.includes(this.properties.model)) {
        this.properties.model = this.models[0]
        this.widget_llm.value = this.models[0]
      }
    }
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(LLMNode.path, LLMNode)
  }
}
