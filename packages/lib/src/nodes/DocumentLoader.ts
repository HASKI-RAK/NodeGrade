/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode } from './litegraph-extensions'

export class DocumentLoader extends LGraphNode {
  constructor() {
    super()
    this.addOut('string')
    this.properties = { value: '' } // uploaded text
    this.addWidget('button', 'Upload file', '', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement)?.files?.[0]
        if (file) {
          this.properties.documentName = file.name
          const reader = new FileReader()
          reader.onload = (e) => {
            this.properties.value = (e.target as FileReader).result as string
          }
          reader.readAsText(file)
        }
      }
      input.click()
    })
    this.addWidget('button', 'Clear', '', () => {
      this.properties.value = ''
    })

    this.serialize_widgets = true
    this.title = 'Document loader'
    this.size = [200, 100]
  }
  //name of the node
  static path = 'basic/document-loader'
  static getPath(): string {
    return DocumentLoader.path
  }

  //name of the function to call when executing
  async onExecute() {
    this.setOutputData(0, this.properties.value)
  }
}
