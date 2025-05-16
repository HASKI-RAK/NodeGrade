/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode } from './litegraph-extensions'

export class PromptMessage extends LGraphNode {
  constructor() {
    super()
    this.title = 'Prompt Message'
    this.properties = { value: { role: 'user', content: '' } }

    //platform.openai.com/docs/api-reference/chat/create
    this.addWidget(
      'combo',
      'role',
      this.properties.value.role ?? 'user',
      (value, widget, node) => {
        node.properties.value.role = value
      },
      {
        values: ['system', 'user', 'assistant', 'tool']
      }
    )
    this.addIn('string')

    this.serialize_widgets = true

    this.addOut('message')
  }
  //name of the node
  static title = 'Prompt Message'
  static path = 'basic/prompt-message'
  static getPath(): string {
    return PromptMessage.path
  }

  //name of the function to call when executing
  async onExecute() {
    this.properties.value = {
      role: this.properties.value.role,
      content: this.getInputData(0)
    }

    this.setOutputData(0, this.properties.value)
  }
}
