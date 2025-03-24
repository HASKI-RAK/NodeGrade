/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode } from './litegraph-extensions'

export class Route extends LGraphNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: { value: any }
  constructor() {
    super()
    this.size = [60, 30]
    this.addIn('*')
    this.addOut('*')
    this.properties = { value: 0 }
    this.title = 'Route'
  }

  //name of the node
  static readonly title = 'Route'
  static readonly desc = 'Routes the input to the output'
  static readonly path = 'utils/route'
  static getPath(): string {
    return Route.path
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.value = this.getInputData(0)
    }
    this.setOutputData(0, this.properties.value)
  }
  getTitle(): string {
    if (this.flags.collapsed) {
      return ''
    }
    return this.title
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDrawBackground = (ctx: CanvasRenderingContext2D) => {
    //show the current value
    this.inputs[0].label = ''
  }
}
