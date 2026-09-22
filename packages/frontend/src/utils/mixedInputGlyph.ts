import { LINK_TYPE_COLORS } from '@haski/ta-lib'
import type { LGraphCanvas, LGraphNode } from 'litegraph.js'

export const MIXED_INPUT_GLYPH_RADIUS = 3

type DrawNode = (node: LGraphNode, context: CanvasRenderingContext2D) => void

type MixedInputCanvas = {
  drawNode: DrawNode
  live_mode?: boolean
  __mixedInputGlyphInstalled?: boolean
}

const acceptsTextAndMessage = (type: unknown): boolean => {
  const types = String(type).split(',')
  return types.includes('message') && types.includes('string')
}

/**
 * Add the string circle inside LiteGraph's message arrow for mixed LLM inputs.
 * The canvas draws this after its stock slots, leaving the yellow arrow visible
 * around the green center so the connection point communicates both types.
 */
export const installMixedInputGlyph = (canvas: LGraphCanvas): void => {
  const runtimeCanvas = canvas as unknown as MixedInputCanvas
  if (runtimeCanvas.__mixedInputGlyphInstalled) return
  runtimeCanvas.__mixedInputGlyphInstalled = true

  const drawNode = runtimeCanvas.drawNode.bind(runtimeCanvas)
  runtimeCanvas.drawNode = (node, context) => {
    drawNode(node, context)
    if (runtimeCanvas.live_mode || node.flags?.collapsed) return

    const position: [number, number] = [0, 0]
    for (const [index, input] of (node.inputs ?? []).entries()) {
      if (!acceptsTextAndMessage(input.type)) continue
      const connection = node.getConnectionPos(true, index, position)
      const x = connection[0] - node.pos[0] - 1
      const y = connection[1] - node.pos[1]

      context.save()
      context.globalAlpha = 1
      context.fillStyle = LINK_TYPE_COLORS.string
      context.beginPath()
      context.arc(x, y, MIXED_INPUT_GLYPH_RADIUS, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
  }
}
