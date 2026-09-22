/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'
import {
  assertPromptContent,
  normalizePromptMessages,
  PromptMessageError
} from './promptMessages'
import type {
  ModelCatalogEntry,
  ModelCompletionRuntime,
  ModelParameter
} from './types/ModelRef'
import { isModelRef } from './types/ModelRef'
import type { InOut, PromptMessageType } from './types/NodeLinkMessage'

/**
 * What the singular `message` port accepts. `message` leads, so the port keeps
 * the message color and arrow shape it has always had (SPEC-0019/FR-008).
 */
const MESSAGE_PORT: readonly InOut[] = ['message', 'string', '[message]']

/**
 * What the aggregate `messages` port accepts: the same, plus a list of plain
 * strings (SPEC-0019/FR-001). Outputs typed `*` — `utils/concat-object`, above
 * all — stay connectable, because LiteGraph treats a wildcard output as
 * compatible with every input.
 */
const MESSAGES_PORT: readonly InOut[] = [
  'message',
  '[message]',
  '[string]',
  'string'
]

const MESSAGE_INPUT_LABEL = 'message | string'
const MESSAGES_INPUT_LABEL = 'messages | strings'

/** Language-model node. Provider credentials remain behind ModelCompletionRuntime. */
export class LLMNode extends LGraphNode {
  static path = 'models/llm'

  runtime?: ModelCompletionRuntime
  widget_llm: ReturnType<LGraphNode['addWidget']>
  models: ModelCatalogEntry[] = []

  constructor() {
    super()
    this.addIn(MESSAGE_PORT, 'message', { label: MESSAGE_INPUT_LABEL })
    this.addIn(MESSAGES_PORT, 'messages', { label: MESSAGES_INPUT_LABEL })
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

  /**
   * The message list this run sends, built from whatever the two ports
   * delivered (SPEC-0019/FR-002, FR-003). Both ports contribute, in slot order,
   * so a role-carrying system message on one port and a bare prompt string on
   * the other compose into one conversation; an unwired port contributes
   * nothing, which leaves every single-port graph sending exactly what it sent
   * before (FR-005).
   *
   * Normalisation is per run and never written back into the graph.
   */
  private messages(): PromptMessageType[] {
    return [0, 1]
      .filter((slot) => this.isInputConnected(slot))
      .flatMap((slot) => {
        try {
          return normalizePromptMessages(this.getInputData<unknown>(slot))
        } catch (cause) {
          throw this.promptError(cause, this.inputs?.[slot]?.name ?? `input ${slot}`)
        }
      })
  }

  /**
   * Re-raises a normalisation failure naming this node, and the port when the
   * failure belongs to one, so the run error identifies where to look
   * (SPEC-0019/FR-006).
   */
  private promptError(cause: unknown, port?: string): Error {
    if (!(cause instanceof PromptMessageError)) return cause as Error
    const where = port ? ` input "${port}"` : ''
    return new Error(`Node "${this.title}"${where} ${cause.message}.`)
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

    const messages = this.messages()
    try {
      assertPromptContent(messages)
    } catch (cause) {
      throw this.promptError(cause)
    }
    // The prompt is the one piece of a model call no output slot shows, so the
    // trace carries it as node detail (SPEC-0019/FR-007).
    this.executionDetails = [
      {
        slot: 0,
        name: 'Prompt sent',
        type: '[message]',
        value: messages,
        truncated: false
      }
    ]

    const result = await this.runtime.complete({
      modelRef,
      messages,
      parameters: this.parameters(),
      signal: this.executionSignal
    })
    this.executionWarnings = result.warnings
    this.properties.value = result.text
    this.properties.model = modelRef.modelId
    this.setOutputData(0, result.text)
  }

  onConfigure(serialized: unknown): void {
    // Restores the widened message ports and the shared port styling; without
    // this call a stored graph keeps the narrow slot types it was saved with
    // (SPEC-0019/FR-008).
    super.onConfigure(serialized)
    if (this.inputs?.[0]) this.inputs[0].label = MESSAGE_INPUT_LABEL
    if (this.inputs?.[1]) this.inputs[1].label = MESSAGES_INPUT_LABEL
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
