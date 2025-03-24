/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphCanvas, Vector2 } from '@haski/ta-lib'
import { WebSocket } from 'ws'

import { LGraphNode } from './litegraph-extensions'
import { ImageWidget } from './widgets/ImageWidget'

export class ImageNode extends LGraphNode {
  properties: { imageUrl?: string }
  widget: ImageWidget
  constructor() {
    super()
    this.addOut('*')
    this.properties = { imageUrl: undefined }
    this.widget = this.addCustomWidget<ImageWidget>(new ImageWidget())
    this.size = [200, 200]
    this.title = 'Image'
  }

  //name of the node
  static title = 'Image'
  static path = 'basic/Image'
  static getPath(): string {
    return ImageNode.path
  }

  setWebSocket(_ws: WebSocket): void {
    this.ws = _ws
  }

  async init(_env: Record<string, unknown>) {
    this.env = _env
  }

  //name of the function to call when executing
  async onExecute() {
    this.setOutputData(0, this.properties.imageUrl)
  }

  onMouseDown(event: MouseEvent, pos: Vector2, graphCanvas: LGraphCanvas): void {
    // only when y greater than the title margin
    if (pos[1] < 10) {
      return
    }
    event.preventDefault()

    if (this.widget) {
      this.widget.createImageUploadElement(this)
    }
  }
}
