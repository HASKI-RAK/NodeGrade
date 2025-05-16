/* eslint-disable immutable/no-this */
/* eslint-disable immutable/no-mutation */
import { IWidget, widgetTypes } from 'litegraph.js'

import { LGraphNode } from '../litegraph-extensions'

export class ImageWidget implements IWidget {
  name: string
  value: string
  y?: number
  properties: { imageUrl: string }
  image?: HTMLImageElement
  type?: widgetTypes

  constructor() {
    this.name = 'image'
    this.value = ''
    this.properties = { imageUrl: '' }
    this.y = 0
    this.type = undefined
  }

  draw?(
    ctx: CanvasRenderingContext2D,
    node: LGraphNode,
    width: number,
    posY: number
    // height: number
  ): void {
    const base64Image = node.properties.imageUrl
    const x = 0
    const y = posY
    ctx.save()

    // Draw rect behind image
    ctx.fillStyle = '#222'
    ctx.fillRect(x, y, width, node.size[1] - y)

    if (base64Image) {
      const img = new Image()
      img.src = base64Image
      img.onload = () => {
        this.image = img
      }
    } else {
      ctx.fillStyle = 'white'
      ctx.font = '16px Arial'
      ctx.textBaseline = 'top'
      ctx.fillText('No image uploaded', x, y)
    }

    if (this.image) {
      ctx.drawImage(this.image, x, y, width, node.size[1] - y)
    }
    // Restore the context to avoid clipping text in the future
    ctx.restore()
  }

  computeSize?(width: number): [number, number] {
    return [width, 100]
  }

  handleImageUpload(node: LGraphNode, event: Event) {
    const input = event.target as HTMLInputElement
    if (input.files && input.files[0]) {
      const reader = new FileReader()
      reader.onload = (e) => {
        // Base64 `data:image/...` String result.
        node.properties.imageUrl = e.target?.result as string
      }
      reader.readAsDataURL(input.files[0])
    }
  }

  createImageUploadElement(node: LGraphNode) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.position = 'absolute'
    input.style.left = '0px'
    input.style.top = '0px'
    input.style.opacity = '0'
    input.style.zIndex = '30'
    input.onchange = (event) => this.handleImageUpload(node, event)
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  }
}
