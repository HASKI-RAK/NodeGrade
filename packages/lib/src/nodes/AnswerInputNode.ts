/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'

/**
 * * This node is evaluated during runtime and is used to get user input send by the form.
 * The server will listen to the user running the fraph and take an extra input from the form.
 * This will be written into properties.value
 * path: input/answer
 */
export class AnswerInputNode extends LGraphNode {
  constructor() {
    super()
    this.addOut('string')
    this.properties = { value: '' }
    this.title = 'Answer Input'
  }

  // statics
  static title = 'Answer Input'

  static path = 'input/answer'

  static getPath(): string {
    return AnswerInputNode.path
  }

  //name of the function to call when executing
  async onExecute() {
    this.setOutputData(0, this.properties.value)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDrawBackground = (ctx: CanvasRenderingContext2D) => {
    //show the current value
    this.outputs[0].label = this.properties.value
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(AnswerInputNode.path, AnswerInputNode)
  }
}
