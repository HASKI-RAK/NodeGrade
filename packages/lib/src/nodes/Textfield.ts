/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphCanvas } from 'litegraph.js'
import { LGraphNode, Vector2 } from './litegraph-extensions'
import { TextWidget } from './widgets/TextWidget'

export class Textfield extends LGraphNode {
  constructor() {
    super()
    this.addOut('string')
    this.properties = { precision: 1, value: 'Enter your text' }
    this.addCustomWidget<TextWidget>(new TextWidget())
    this.size = [200, 100]
    this.title = 'Textfield'
  }
  //name of the node
  static title = 'Textfield'
  static path = 'basic/textfield'
  static getPath(): string {
    return Textfield.path
  }

  //name of the function to call when executing
  async onExecute() {
    this.setOutputData(0, this.properties.value)
  }

  onMouseDown(event: MouseEvent, pos: Vector2, graphCanvas: LGraphCanvas): void {
    // only when y greater than the title margin
    if (pos[1] < 10) {
      return
    }
    event.preventDefault()
    graphCanvas.showEditPropertyValue(this, 'value', { pos: pos })
    // graphCanvas.prompt(
    //   'Enter your text',
    //   this.properties.value,
    //   (v) => {
    //     this.properties.value = v
    //   },
    //   undefined
    // )
  }
}
