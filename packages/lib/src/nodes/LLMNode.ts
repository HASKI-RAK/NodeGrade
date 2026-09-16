/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'
import type {
  ModelCatalogEntry,
  ModelCompletionRuntime,
  ModelParameter
} from './types/ModelRef'
import { isModelRef } from './types/ModelRef'
import type { PromptMessageType } from './types/NodeLinkMessage'

/** Language-model node. Provider credentials remain behind ModelCompletionRuntime. */
export class LLMNode extends LGraphNode {
  static path = 'models/llm'

  runtime?: ModelCompletionRuntime
  widget_llm: ReturnType<LGraphNode['addWidget']>
  models: ModelCatalogEntry[] = []

  constructor() {
    super()
    this.addIn('message')
    this.addIn('*', 'messages')
    this.addWidget(
      'number',
      'max_tokens',
      64,
      (value) => {
        this.properties.max_tokens = value
      },
      { min: 0, max: 32768, step: 1, precision: 0 }
    )
    this.addWidget(
      'slider',
      'temperature',
      0.4,
      (value) => {
        this.properties.temperature = value
      },
      { min: 0, max: 2, step: 0.01, precision: 2 }
    )
    this.addWidget(
      'slider',
      'top_p',
      1,
      (value) => {
        this.properties.top_p = value
      },
      { min: 0, max: 1, step: 0.01, precision: 2 }
    )
    this.addWidget(
      'number',
      'top_k',
      50,
      (value) => {
        this.properties.top_k = value
      },
      { min: 1, max: 200, step: 1, precision: 0 }
    )
    this.addWidget(
      'slider',
      'presence_penalty',
      0,
      (value) => {
        this.properties.presence_penalty = value
      },
      { min: -2, max: 2, step: 0.1, precision: 1 }
    )
    this.widget_llm = this.addWidget('combo', 'model', '', () => undefined, {
      values: []
    })
    this.serialize_widgets = true
    this.addOut('string')
    this.properties = {
      value: '',
      model: '',
      model_ref: null,
      needs_model_selection: true,
      temperature: 0.4,
      max_tokens: 64,
      top_p: 1,
      top_k: 50,
      presence_penalty: 0
    }
    this.title = 'LLM'
  }

  static getPath(): string {
    return LLMNode.path
  }

  async init(_env: Record<string, unknown>): Promise<void> {
    // Runtime and catalog are injected by backend and frontend owners.
  }

  setModelCatalog(models: ModelCatalogEntry[]): void {
    this.models = models
    this.widget_llm.options = {
      values: models.map((entry) => `${entry.label} · ${entry.providerName}`)
    }
  }

  setRuntime(runtime: ModelCompletionRuntime): void {
    this.runtime = runtime
  }

  private messages(): PromptMessageType[] {
    const message = this.getInputData<PromptMessageType | undefined>(0)
    const messages = this.getInputData<PromptMessageType[] | undefined>(1)
    if (message) return [message]
    return messages ?? []
  }

  private parameters(): Partial<Record<ModelParameter, number>> {
    const result: Partial<Record<ModelParameter, number>> = {}
    const parameters: ModelParameter[] = [
      'max_tokens',
      'temperature',
      'top_p',
      'top_k',
      'presence_penalty'
    ]
    for (const parameter of parameters) {
      const value = this.properties[parameter]
      if (typeof value === 'number') result[parameter] = value
    }
    return result
  }

  async onExecute(): Promise<void> {
    const modelRef = this.properties.model_ref
    if (!isModelRef(modelRef) || this.properties.needs_model_selection === true)
      throw new Error('Select an available provider and model before execution.')
    if (!this.runtime) throw new Error('Language-model runtime is unavailable.')

    const result = await this.runtime.complete({
      modelRef,
      messages: this.messages(),
      parameters: this.parameters(),
      signal: this.executionSignal
    })
    this.executionWarnings = result.warnings
    this.properties.value = result.text
    this.properties.model = modelRef.modelId
    this.setOutputData(0, result.text)
  }

  onConfigure(_serialized: unknown): void {
    const modelRef = this.properties.model_ref
    if (isModelRef(modelRef)) {
      this.properties.model = modelRef.modelId
      this.widget_llm.value = modelRef.modelId
    }
  }

  static register(): void {
    LiteGraph.registerNodeType(LLMNode.path, LLMNode)
  }
}
