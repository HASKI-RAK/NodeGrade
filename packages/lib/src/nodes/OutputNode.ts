/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import type {
  OutputAudience,
  OutputPresentation,
  OutputType,
  OutputValue
} from '../events'
import { LGraphNode, LiteGraph } from './litegraph-extensions'
import { DEFAULT_TONE_MAP } from './utils/outputPresentation'

/** Types a facilitator picks for an output node; `review` belongs to the flag node. */
export const OUTPUT_TYPES: readonly OutputType[] = [
  'text',
  'score',
  'classifications',
  'verdict',
  'report',
  'checklist',
  'measure'
]

export const OUTPUT_AUDIENCES: readonly OutputAudience[] = ['everyone', 'educator']

/** Score cards award the pass chip here unless the node says otherwise (SPEC-0007/FR-004). */
export const DEFAULT_PASS_MARK = 60

export type OutputNodeProperties = {
  uniqueId: string
  type: OutputType
  label: string
  value: OutputValue
  detail: string
  section: string
  audience: OutputAudience
  toneMap: string
  statusKey: string
  /** Zero means the type's own default: 100 for a score, 1 for a measure. */
  max: number
  /** Zero or less means no pass chip. */
  passMark: number
}

/**
 * Sends a value to the participant's results as one card.
 *
 * The value arrives on the first input. The optional second input, `detail`,
 * is a sentence shown under the body — wire a text node to it to explain what
 * the card measures, or a node's own explanation output. The presentation
 * properties (section, audience, tone map, scale) are edited in the inspector
 * and travel with the value, so a stored run renders exactly as the live one did.
 *
 * path: output/output
 */
export class OutputNode extends LGraphNode {
  // Editor identity (wrapperId/sourceId) is resolved by the server at emit time, so it
  // is not a node property.
  properties: OutputNodeProperties
  constructor() {
    super()
    this.title = 'feedback output'
    this.addIn('*', 'value')
    this.addIn('string', 'detail')
    this.properties = {
      uniqueId: this.id.toString(),
      type: 'text',
      label: 'feedback',
      value: '',
      detail: '',
      section: '',
      audience: 'everyone',
      toneMap: DEFAULT_TONE_MAP,
      statusKey: '',
      max: 0,
      passMark: DEFAULT_PASS_MARK
    }
    this.addWidget(
      'text',
      'Label',
      this.properties.label,
      (t) => {
        this.properties.label = t
      },
      { placeholder: 'Label' }
    )
    this.addWidget(
      'combo',
      'Output Type',
      'text',
      (t) => {
        this.properties.type = t
      },
      { values: [...OUTPUT_TYPES] }
    )
    this.addWidget('toggle', 'Educator only', false, (v: boolean) => {
      this.properties.audience = v ? 'educator' : 'everyone'
    })
    this.serialize_widgets = true
  }

  // statics
  static title = 'output'

  static path = 'output/output'

  static getPath(): string {
    return OutputNode.path
  }

  /** Graphs saved before the `detail` input existed come back with one slot. */
  onConfigure(serialized: unknown): void {
    super.onConfigure(serialized)
    if ((this.inputs?.length ?? 0) < 2) this.addIn('string', 'detail')
  }

  /** Everything the card needs beyond the value, minus fields at their defaults. */
  presentation(): OutputPresentation {
    const p = this.properties
    const out: OutputPresentation = {}
    if (p.detail) out.detail = p.detail
    if (p.section) out.section = p.section
    if (p.audience === 'educator') out.audience = 'educator'
    if (p.toneMap) out.toneMap = p.toneMap
    if (p.statusKey) out.statusKey = p.statusKey
    if (typeof p.max === 'number' && p.max > 0) out.max = p.max
    if (typeof p.passMark === 'number') out.passMark = p.passMark
    return out
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.value = this.getInputData(0)
    }
    const detail = this.inputs[1] ? this.getInputData(1) : undefined
    this.properties.detail =
      detail === undefined || detail === null ? '' : String(detail)
    const output = {
      eventName: 'outputSet' as const,
      payload: {
        uniqueId: this.id.toString(),
        type: this.properties.type,
        label: this.properties.label,
        value: this.properties.value,
        ...this.presentation()
      }
    }
    this.emitEventCallback?.(output)
  }

  getTitle(): string {
    if (this.flags.collapsed) {
      return this.inputs[0].label ?? this.title
    }
    return this.title
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDrawBackground = (ctx: CanvasRenderingContext2D) => {
    //show the current value
    this.inputs[0].label =
      'feedback: ' + (this.properties.type.substring(0, 10) ?? this.title)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(OutputNode.path, OutputNode)
  }
}
