/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'
/**
 * * Performs a math operation on two numbers
 */
export class MathOperationNode extends LGraphNode {
  properties: {
    value?: number
    operation: string
    valueOne: number | undefined
    valueTwo: number | undefined
  }
  constructor() {
    super()
    this.properties = {
      operation: '+',
      valueOne: undefined,
      valueTwo: undefined
    }
    this.addIn('number')
    this.addIn('number')

    this.addWidget(
      'combo',
      'operation',
      '+',
      (v) => {
        this.properties.operation = v
      },
      {
        values: ['+', '-', '*', '/']
      }
    )
    this.serialize_widgets = true
    this.addOut('number')
    this.title = 'Math Operation'
  }

  // statics
  static title = 'Math Operation'

  static path = 'math/math-operation'

  static getPath(): string {
    return MathOperationNode.path
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.valueOne = this.getInputData(0)
    }
    if (this.inputs[1]) {
      this.properties.valueTwo = this.getInputData(1)
    }

    if (
      this.properties.valueOne === undefined ||
      this.properties.valueTwo === undefined
    ) {
      throw new Error('Missing input')
    }

    let number = 0
    switch (this.properties.operation) {
      case '+':
        number = this.properties.valueOne + this.properties.valueTwo
        break
      case '-':
        number = this.properties.valueOne - this.properties.valueTwo
        break
      case '*':
        number = this.properties.valueOne * this.properties.valueTwo
        break
      case '/':
        number = this.properties.valueOne / this.properties.valueTwo
        break
      default:
        break
    }
    // console.log('MathOperationNode', number)
    this.properties.value = number // for debugging

    this.setOutputData(0, number)
  }
  getTitle(): string {
    if (this.flags.collapsed) {
      return this.properties.operation
    }
    return this.title
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(MathOperationNode.path, MathOperationNode)
  }
}
