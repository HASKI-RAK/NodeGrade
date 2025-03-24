/* eslint-disable immutable/no-this */
/* eslint-disable immutable/no-mutation */
import { IWidget, widgetTypes } from 'litegraph.js'

import { LGraphNode } from '../litegraph-extensions'

export class TextWidget implements IWidget {
  name: string
  value: string
  y?: number
  properties: { value: string }
  type?: widgetTypes

  constructor() {
    this.name = 'text'
    this.value = 'Dis is a value'
    this.properties = { value: 'Enter aayour text' }
    this.y = 0
    this.type = undefined
  }

  draw?(
    ctx: CanvasRenderingContext2D,
    node: LGraphNode,
    width: number,
    posY: number,
    height: number
  ): void {
    const text = node.properties.value
    const lineHeight = 16
    const x = 0
    let y = posY
    ctx.save()

    const canvas = ctx.canvas
    const canvasRect = canvas.getBoundingClientRect()
    // get this node's position relative to the canvas
    const nodeRect = node.getBounding()

    // get canvas transform info
    const transform = ctx.getTransform()

    // get the canvas scale factor
    const scaleA = transform.a

    const scaleD = transform.d
    const scale = scaleA > scaleD ? scaleA : scaleD

    // get the canvas offset
    const left = canvasRect.left + window.pageXOffset

    const top = canvasRect.top + window.pageYOffset

    // get the node's position relative to the canvas
    const nodeX = nodeRect[0]
    const nodeY = nodeRect[1]

    const nodeWidth = nodeRect[2] * scale
    const nodeHeight = nodeRect[3] * scale

    const transformedX = transform.a * nodeX + transform.c * nodeY + transform.e
    const transformedY = transform.b * nodeX + transform.d * nodeY + transform.f

    // offset based on canvas scale and transform
    const nodeLeft = transform.e * transform.d
    const nodeTop = transform.f * transform.d + 20

    // // insert html text field above canvas if it doesn't exist
    // if (!document.getElementById('textWidget' + node.id)) {
    //   const html = document.createElement('input') as HTMLInputElement
    //   // give it a unique identifier
    //   html.id = 'textWidget' + node.id
    //   // placeholder text
    //   html.placeholder = 'Enter text'

    //   // label input form field
    //   html.name = 'textWidget' + node.id
    //   // set the value
    //   html.value = node.properties.value

    //   html.type = 'text'
    //   html.style.position = 'absolute'
    //   html.style.left = `${nodeLeft}px`
    //   html.style.top = `${nodeTop}px`
    //   html.style.width = `${width}px`
    //   html.style.height = `${height}px`
    //   html.style.border = 'none'
    //   html.style.padding = '0px'
    //   html.style.margin = '0px'
    //   html.style.outline = 'none'
    //   html.style.zIndex = '30'
    //   html.style.textAlign = 'left'
    //   html.style.font = '14px Arial'
    //   html.style.color = 'white'
    //   html.style.backgroundColor = 'red'
    //   html.style.opacity = '0.75'
    //   html.style.overflow = 'hidden'
    //   html.style.resize = 'none'
    //   html.onchange = () => {
    //     node.properties.value = html.value
    //   }
    //   document.body.appendChild(html)
    // } else {
    //   // if it does exist, update the value
    //   const html = document.getElementById('textWidget' + node.id) as HTMLInputElement
    //   html.style.left = `${nodeLeft}px`
    //   html.style.top = `${nodeTop}px`
    //   html.style.width = `${width}px`
    //   html.style.height = `${height}px`
    //   // if (html) {
    //   //   html.value = node.properties.value
    //   // }
    // }

    // draw rect behind text
    ctx.fillStyle = '#222'
    ctx.fillRect(x, y, width, node.size[1] - y)

    const words = text.split(' ')
    let line = ''

    ctx.fillStyle = 'white' // Text color
    ctx.font = '16px Arial' // Set the font here as needed
    ctx.textBaseline = 'top'
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' '
      const metrics = ctx.measureText(testLine)
      const testWidth = metrics.width
      if (testWidth > width && n > 0) {
        ctx.fillText(line, x, y)
        line = words[n] + ' '
        y += lineHeight
      } else {
        line = testLine
      }
    }
    ctx.fillText(line, x, y)

    // Restore the context to avoid clipping text in the future
    ctx.restore()
  }
  computeSize?(width: number): [number, number] {
    return [width, 50]
  }
}
