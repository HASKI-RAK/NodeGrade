/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from '../litegraph-extensions'
/**
 * * Performs a math operation on two numbers
 */
export class CountNode extends LGraphNode {
  properties: {
    operation: string // what to cound. words, characters, sentences
    valueOne: string | undefined
  }
  constructor() {
    super()
    this.properties = {
      operation: 'words',
      valueOne: undefined
    }
    this.addIn('string')

    this.addWidget(
      'combo',
      'operation',
      'words',
      (v) => {
        this.properties.operation = v
      },
      {
        values: ['words', 'characters', 'sentences']
      }
    )
    this.serialize_widgets = true
    this.addOut('number')
    this.title = 'Count'
  }

  // statics
  static readonly title = 'Count'

  static readonly path = 'utils/count'

  static getPath(): string {
    return CountNode.path
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.valueOne = this.getInputData(0)
    }

    if (this.properties.valueOne === undefined) {
      throw new Error('Missing input')
    }

    let count = 0
    switch (this.properties.operation) {
      case 'words':
        count = this.properties.valueOne.split(' ').length
        break
      case 'characters':
        count = this.properties.valueOne.length
        break
      case 'sentences':
        count = this.properties.valueOne.split('.').length
        break
      default:
        throw new Error('Invalid operation')
    }
    this.setOutputData(0, count)
  }
  getTitle(): string {
    if (this.flags.collapsed) {
      return this.properties.operation
    }
    return this.title
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(CountNode.path, CountNode)
  }
}
