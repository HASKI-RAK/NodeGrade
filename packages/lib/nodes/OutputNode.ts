/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { WebSocket } from 'ws'

import { OutputType, ServerEvent, ServerEventPayload } from '../events'
import { LGraphNode, LiteGraph } from './litegraph-extensions'

/**
 * * This node is used to send data to the client into the TA form
 * path: output/feedback
 */
export class OutputNode extends LGraphNode {
  properties: ServerEventPayload['outputSet']
  constructor() {
    super()
    this.title = 'feedback output'
    this.addIn('*')
    this.properties = {
      uniqueId: this.id.toString(),
      type: 'text',
      label: 'feedback',
      value: ''
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
      { values: Object.values<OutputType>(['text', 'score', 'classifications']) }
    )
    this.serialize_widgets = true
  }

  // statics
  static title = 'output'

  static path = 'output/output'

  static getPath(): string {
    return OutputNode.path
  }

  // this node uses the websocket
  setWebSocket(ws: WebSocket) {
    this.ws = ws
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.value = this.getInputData(0)
    }
    const output: ServerEvent<'output'> = {
      eventName: 'output',
      payload: {
        uniqueId: this.id.toString(),
        type: this.properties.type,
        label: this.properties.label,
        value: this.properties.value
      }
    }
    // console.log('output', output)
    this.ws?.send(JSON.stringify(output))
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
