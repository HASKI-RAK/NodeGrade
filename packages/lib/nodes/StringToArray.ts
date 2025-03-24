/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode } from './litegraph-extensions'

export class StringsToArray extends LGraphNode {
  constructor() {
    super()
    this.title = 'StringsToArray'
    this.addIn('string')
    this.addIn('string')
    this.properties = { value: [] }

    this.addOut('[string]')
  }
  //name of the node
  static title = 'Strings to Array'
  static path = 'utils/strings-to-array'
  static getPath(): string {
    return StringsToArray.path
  }

  //name of the function to call when executing
  async onExecute() {
    const output = []
    if (this.getInputData(0) !== null) {
      output.push(this.getInputData(0))
    }
    if (this.getInputData(1) !== null) {
      output.push(this.getInputData(1))
    }
    this.properties.value = output
    // console.log(this.properties.value)
    this.setOutputData(0, output)
  }
}
