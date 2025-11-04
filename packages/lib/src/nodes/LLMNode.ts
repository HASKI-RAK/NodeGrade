/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'
import { PromptMessageType } from './types/NodeLinkMessage'
import { OpenAiApiResponse, OpenAiModel } from './types/OpenAiApi'

// record with all models
// const models = [
//   {
//     name: 'zephir',
//     path: 'D:\\Development\\python\\text-generation-webui-main\\models\\zephir-7b-beta'
//   },
//   {
//     name: 'zephir-7b-beta',
//     path: 'D:\\Development\\python\\text-generation-webui-main\\models\\zephir-7b-beta'
//   },
//   {
//     name: 'SUS-Chat-34B',
//     path: 'SUS-Chat-34B'
//   },
//   {
//     name: 'Wizard-Vicuna-30B-Uncensored',
//     path: 'Wizard-Vicuna-30B-Uncensored'
//   },
//   {
//     name: 'microsoft/Orca-2-13b',
//     path: 'Orca-2-13b'
//   }
// ]

/**
 * Language Model node
 */
export class LLMNode extends LGraphNode {
  env: Record<string, unknown>
  widget_llm: any
  models: string[] = []

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
      guidance_scale: 1
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
    try {
      const models = await this.fetchModels(
        (this.env.MODEL_WORKER_URL ?? 'http://193.174.195.36:8000') + '/v1/models'
      )
      this.initModels(models)
    } catch (error) {
      console.error('Failed to fetch models:', error)
    }
  }

  initModels(models: string[]) {
    this.models = models
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

  //name of the function to call when executing
  async onExecute() {
    //get inputs
    const message = this.getInputData<PromptMessageType | undefined>(0)
    const messages = this.getInputData<PromptMessageType[] | undefined>(1)
    const input = {
      model: this.properties.model,
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

    // TODO: sanity check input
    const required_input = JSON.stringify(input)
    // console.log(required_input)
    // fetch from server
    console.log(this.env.MODEL_WORKER_URL)
    const response = await fetch(
      (this.env.MODEL_WORKER_URL ?? 'http://193.174.195.36:8000') +
        '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: required_input
      }
    )
    if (!response.ok) {
      // console log the error
      console.log(response.statusText)
      throw new Error('Network response was not ok')
    }

    // get response
    const data = await response.json()
    const choices = data.choices
    // console.log(choices)
    //send output to the output
    // console.log(choices[0].message.content)
    this.properties.value = choices[0].message.content
    this.setOutputData(0, choices[0].message.content)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(LLMNode.path, LLMNode)
  }
}
