/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode } from './litegraph-extensions'

export class ConcatObject extends LGraphNode {
  properties: {
    value: any[]
  }
  constructor() {
    super()
    this.title = 'Concat Object'
    //platform.openai.com/docs/api-reference/chat/create
    this.addIn('*')
    this.addIn('*')

    this.properties = { value: [] }

    this.addOut('*')
  }
  //name of the node
  static title = 'Concat Object'
  static path = 'utils/concat-object'
  static getPath(): string {
    return ConcatObject.path
  }

  //name of the function to call when executing
  async onExecute() {
    this.properties.value = [this.getInputData(0), this.getInputData(1)].flat(Infinity)
    // console.log(this.properties.value)
    this.setOutputData(0, this.properties.value)
  }
}
