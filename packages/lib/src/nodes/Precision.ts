/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'

/**
 * Precision
 *
 * Truncates a number to the specified number of decimal places.
 */
export class Precision extends LGraphNode {
  constructor() {
    super()
    this.addIn('number')

    this.addWidget('number', 'precision', 1, (v) => {
      this.properties.precision = v
    })

    this.addOut('number')
    this.properties = {
      value: -1,
      precision: 1
    }
    this.title = 'Precision'
    this.serialize_widgets = true
  }

  //name of the node
  static title = 'Precision'
  static path = 'math/precision'

  static getPath(): string {
    return Precision.path
  }

  //name of the function to call when executing
  async onExecute() {
    //get input
    const input = this.getInputData(0)
    const precision = this.properties.precision

    // Truncate to the specified number of decimal places
    const data = Math.trunc(input * 10 ** precision) / 10 ** precision

    //send output to the output
    this.setOutputData(0, data)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(Precision.path, Precision)
  }
}
