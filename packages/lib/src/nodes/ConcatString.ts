/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'

export class ConcatString extends LGraphNode {
  constructor() {
    super()
    this.title = 'concat'

    this.addIn('string')
    this.addIn('string')
    this.properties = { value: '', space: true }
    this.addWidget('toggle', 'space in between', this.properties.space, (v) => {
      this.properties.space = v
    })
    this.serialize_widgets = true
    this.addOut('string')
  }

  //name of the node
  static title = 'concat'
  static path = 'utils/concat-string'

  static getPath(): string {
    return ConcatString.path
  }

  //name of the function to call when executing
  async onExecute() {
    const input1 = this.getInputData(0)
    const input2 = this.getInputData(1)
    // console.log(input1, input2)
    // console.log(this.properties.space)
    this.properties.value = this.properties.space
      ? `${input1} ${input2}`
      : `${input1}${input2}`
    this.serialize_widgets = true
    this.setOutputData(0, this.properties.value)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(ConcatString.path, ConcatString)
  }
}
