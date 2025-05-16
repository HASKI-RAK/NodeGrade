/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode } from './litegraph-extensions'

export class Watch extends LGraphNode {
  constructor() {
    super()
    this.size = [60, 30]
    this.addIn('*')
    this.properties = { value: 0 }
    this.title = 'watch'
  }

  //name of the node
  static title = 'watch'
  static desc = 'Shows the input value'
  static path = 'basic/watch'
  static getPath(): string {
    return Watch.path
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.value = this.getInputData(0)
    }
  }
  getTitle(): string {
    if (this.flags.collapsed) {
      return this.inputs[0].label ?? this.title
    }
    return this.title
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static stringyfy = function (o: string | number | Array<any> | null): string {
    if (o == null) {
      return 'null'
    } else if (o.constructor === Number) {
      return o.toFixed(3)
    } else if (o.constructor === Array) {
      var str = '['
      for (var i = 0; i < o.length; ++i) {
        str += Watch.stringyfy(o.at(i)) + (i + 1 != o.length ? ',' : '')
      }
      str += ']'
      return str
    } else {
      return String(o)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDrawBackground = (ctx: CanvasRenderingContext2D) => {
    //show the current value
    this.inputs[0].label = Watch.stringyfy(this.properties.value)
  }
}
