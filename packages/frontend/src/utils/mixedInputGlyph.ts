import { LINK_TYPE_COLORS, LiteGraph } from '@haski/ta-lib'
import type { LGraphCanvas, LGraphNode } from 'litegraph.js'

export const MIXED_INPUT_GLYPH_RADIUS = 4

type DrawNode = (node: LGraphNode, context: CanvasRenderingContext2D) => void

type MixedInputCanvas = {
  drawNode: DrawNode
  ds?: { scale: number }
  inner_text_font?: string
  live_mode?: boolean
  __mixedInputGlyphInstalled?: boolean
}

const acceptsTextAndMessage = (type: unknown): boolean => {
  const types = String(type).split(',')
  return types.includes('message') && types.includes('string')
}

const inputLabels = (name: string, label?: string | null): [string, string] => {
  const [messageLabel, stringLabel] = label?.split('|').map((part) => part.trim()) ?? []
  if (messageLabel && stringLabel) return [messageLabel, stringLabel]
  return name === 'messages' ? ['messages', 'strings'] : ['message', 'string']
}

/**
 * Render each mixed input as a two-part legend at the front of the node:
 * message arrow + label, separator, then string circle + label. LiteGraph draws
 * the arrow itself; this wrapper temporarily suppresses the stock combined label
 * and draws the separated legend after the node.
 */
export const installMixedInputGlyph = (canvas: LGraphCanvas): void => {
  const runtimeCanvas = canvas as unknown as MixedInputCanvas
  if (runtimeCanvas.__mixedInputGlyphInstalled) return
  runtimeCanvas.__mixedInputGlyphInstalled = true

  const drawNode = runtimeCanvas.drawNode.bind(runtimeCanvas)
  runtimeCanvas.drawNode = (node, context) => {
    const mixedInputs = (node.inputs ?? [])
      .map((input, index) => ({ input, index }))
      .filter(({ input }) => acceptsTextAndMessage(input.type))
    const originalLabels = mixedInputs.map(({ input }) => input.label)

    mixedInputs.forEach(({ input }) => {
      input.label = ''
    })
    try {
      drawNode(node, context)
    } finally {
      mixedInputs.forEach(({ input }, index) => {
        input.label = originalLabels[index]
      })
    }

    if (
      runtimeCanvas.live_mode ||
      node.flags?.collapsed ||
      (runtimeCanvas.ds?.scale ?? 1) < 0.6
    )
      return

    const position: [number, number] = [0, 0]
    for (const { input, index } of mixedInputs) {
      const connection = node.getConnectionPos(true, index, position)
      let x = connection[0] - node.pos[0] + 10
      const y = connection[1] - node.pos[1]
      const baseline = y + 5
      const [messageLabel, stringLabel] = inputLabels(input.name, input.label)

      context.save()
      context.globalAlpha = 1
      if (runtimeCanvas.inner_text_font) context.font = runtimeCanvas.inner_text_font
      context.textAlign = 'left'
      context.textBaseline = 'alphabetic'
      context.fillStyle = LiteGraph.NODE_TEXT_COLOR
      context.fillText(messageLabel, x, baseline)
      x += context.measureText(messageLabel).width
      context.fillText(' | ', x, baseline)
      x += context.measureText(' | ').width

      const stringGlyphX = x + MIXED_INPUT_GLYPH_RADIUS
      context.fillStyle = LINK_TYPE_COLORS.string
      context.beginPath()
      context.arc(stringGlyphX, y, MIXED_INPUT_GLYPH_RADIUS, 0, Math.PI * 2)
      context.fill()

      context.fillStyle = LiteGraph.NODE_TEXT_COLOR
      context.fillText(stringLabel, stringGlyphX + MIXED_INPUT_GLYPH_RADIUS + 4, baseline)
      context.restore()
    }
  }
}
