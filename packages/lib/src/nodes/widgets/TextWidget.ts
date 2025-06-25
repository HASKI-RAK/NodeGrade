/* eslint-disable immutable/no-this */
/* eslint-disable immutable/no-mutation */
import { IWidget, Vector2, widgetTypes } from 'litegraph.js'

import { LGraphNode } from '../litegraph-extensions'

/**
 * TextWidget - A multi-line text widget with inline editing capabilities for LiteGraph.js nodes
 *
 * This widget provides a text display area that supports:
 * - Multi-line text rendering with automatic word wrapping
 * - Inline editing via HTML textarea overlay
 * - Click-to-edit functionality
 * - Visual feedback during editing (hides canvas text to prevent double rendering)
 *
 * Usage:
 * - Click on the text area to start inline editing
 * - Use Shift+Enter for new lines, Enter to save changes
 * - Press Escape to cancel editing without saving changes
 *
 * @implements {IWidget}
 */
export class TextWidget implements IWidget {
  /** Widget identifier name */
  name: string
  /** Widget display value */
  value: string
  /** Y position offset within the node */
  y?: number
  /** Widget properties containing the actual text value */
  properties: { value: string }
  /** Widget type classification */
  type?: widgetTypes
  /** Flag to track if widget is currently in editing mode */
  isEditing?: boolean

  /**
   * Creates a new TextWidget instance with default values
   */
  constructor() {
    this.name = 'text'
    this.value = 'Dis is a value'
    this.properties = { value: 'Enter your text' }
    this.y = 0
    this.type = undefined
    this.isEditing = false
  }

  /**
   * Renders the text widget on the canvas with multi-line support and word wrapping
   *
   * Features:
   * - Draws a background rectangle behind the text
   * - Automatically wraps text to fit within the widget width
   * - Skips text rendering when inline editing is active to prevent visual conflicts
   * - Uses consistent font styling (16px Arial, white text on dark background)
   *
   * @param ctx - The 2D rendering context for drawing
   * @param node - The parent LiteGraph node containing this widget
   * @param width - Available width for the widget
   * @param posY - Y position where the widget should be drawn
   * @param height - Available height for the widget
   */
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

    // draw rect behind text
    // ctx.fillStyle = '#222' // background color
    ctx.fillRect(x, y, width, node.size[1] - y)

    // Skip text rendering if currently editing via HTML input
    if (
      document.getElementById('inlineTextInput') ||
      document.getElementById('textWidget' + node.id)
    ) {
      ctx.restore()
      return
    }

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

  /**
   * Computes the preferred size for the text widget
   *
   * This method determines the widget's dimensions based on the available width.
   * Currently returns a fixed height of 50 pixels, but could be enhanced to
   * calculate height based on text content and line count.
   *
   * @param width - The available width for the widget
   * @returns A tuple [width, height] representing the widget's preferred dimensions
   */
  computeSize?(width: number): [number, number] {
    return [width, 50]
  }
}
