/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { WebSocket } from 'ws'

import { ServerEvent } from '../events'
import { LGraphNode, LiteGraph } from './litegraph-extensions'

/**
 * * This node is used to limit the amount of characters a user can input
 * * It is used in the frontend to limit the amount of characters a user can input
 */
export class MaxInputChars extends LGraphNode {
  constructor() {
    super()
    this.addIn('number')
    this.properties = { value: 700 }
    this.title = 'max input chars'
  }

  // statics
  static title = 'max input chars'

  static path = 'input/max-input-chars'

  static getPath(): string {
    return MaxInputChars.path
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
    const output: ServerEvent<'maxInputChars'> = {
      eventName: 'maxInputChars',
      payload: this.properties.value
    }
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
    this.inputs[0].label = 'max input chars: ' + (this.properties.value ?? this.title)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(MaxInputChars.path, MaxInputChars)
  }
}
