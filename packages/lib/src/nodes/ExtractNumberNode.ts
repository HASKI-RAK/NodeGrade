/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'
/**
 * * Extracts the last number from a string
 */
export class ExtractNumberNode extends LGraphNode {
  properties: {
    value: string
  }
  constructor() {
    super()
    this.properties = {
      value: ''
    }
    this.addIn('string')

    this.addOut('number')
    this.title = 'Extract Number'
  }

  // statics
  static title = 'Extract Number'

  static path = 'preprocessing/extract-number'

  static getPath(): string {
    return ExtractNumberNode.path
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.value = this.getInputData(0)
    }
    const matches = this.properties.value.match(/\d+/)
    if (matches) {
      this.properties.value = matches.pop() ?? ''
    }

    const number = parseFloat(this.properties.value)

    this.setOutputData(0, number)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(ExtractNumberNode.path, ExtractNumberNode)
  }
}
