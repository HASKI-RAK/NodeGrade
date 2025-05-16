/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode } from './litegraph-extensions'

export class StringArrayToString extends LGraphNode {
  properties: { value: string; separator: string }
  constructor() {
    super()
    this.title = 'StringArrayToString'
    this.addIn('[string]')
    this.properties = { value: '', separator: ' ' }
    this.addWidget(
      'combo',
      'separator',
      ' ',
      (value, widget, node) => {
        switch (value) {
          case 'space':
            node.properties.separator = ' '
            break
          case 'new line':
            node.properties.separator = '\n'
            break
          case 'comma':
            node.properties.separator = ','
            break
          case 'tab':
            node.properties.separator = '\t'
            break
          default:
            node.properties.separator = ' '
            break
        }
      },
      {
        values: ['space', 'new line', 'comma', 'tab']
      }
    )

    this.addOut('string')
  }
  //name of the node
  static title = 'String Array to String'
  static path = 'utils/string-array-to-string'
  static getPath(): string {
    return StringArrayToString.path
  }

  //name of the function to call when executing
  async onExecute() {
    const input = this.getInputData(0)
    if (input !== null) {
      this.properties.value = input.join(this.properties.separator)
    }
    // console.log(this.properties.value)

    this.setOutputData(0, this.properties.value)
  }
}
