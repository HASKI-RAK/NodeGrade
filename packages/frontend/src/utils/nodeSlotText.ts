import { LiteGraph } from '@haski/ta-lib'
import type { LGraphCanvas, LGraphNode } from 'litegraph.js'

import { acceptsTextAndMessage } from './mixedInputGlyph'

type SlotTextCanvas = LGraphCanvas & {
  __nodeSlotTextInstalled?: boolean
}

const slotTextLayout = (
  input: boolean,
  horizontal: boolean
): { align: CanvasTextAlign; xOffset: number; yOffset: number } => {
  if (horizontal) {
    return { align: 'center', xOffset: 0, yOffset: input ? -10 : -8 }
  }
  if (input) return { align: 'left', xOffset: 10, yOffset: 5 }
  return { align: 'right', xOffset: -10, yOffset: 5 }
}

const drawSlotLabels = (
  node: LGraphNode,
  context: CanvasRenderingContext2D,
  input: boolean
): void => {
  const slots = input ? node.inputs : node.outputs
  const position: [number, number] = [0, 0]
  const { align, xOffset, yOffset } = slotTextLayout(input, Boolean(node.horizontal))
  context.textAlign = align

  for (const [index, slot] of (slots ?? []).entries()) {
    // The mixed-input renderer paints its own two-part legend at every zoom.
    if (input && acceptsTextAndMessage(slot.type)) continue
    const label = slot.label ?? slot.name
    if (!label) continue
    const [x, y] = node.getConnectionPos(input, index, position)
    context.fillText(label, x - node.pos[0] + xOffset, y - node.pos[1] + yOffset)
  }
}

/** LiteGraph skips all port labels below 0.6 zoom, even when they remain readable. */
export const installNodeSlotText = (canvas: LGraphCanvas): void => {
  const runtime = canvas as SlotTextCanvas
  if (runtime.__nodeSlotTextInstalled) return
  runtime.__nodeSlotTextInstalled = true

  const drawNode = runtime.drawNode.bind(runtime)
  runtime.drawNode = (node: LGraphNode, context: CanvasRenderingContext2D) => {
    drawNode(node, context)
    if (runtime.live_mode || node.flags?.collapsed || runtime.ds.scale >= 0.6) return

    context.save()
    context.globalAlpha = runtime.editor_alpha
    context.font = runtime.inner_text_font
    context.fillStyle = LiteGraph.NODE_TEXT_COLOR
    context.textBaseline = 'alphabetic'

    drawSlotLabels(node, context, true)
    drawSlotLabels(node, context, false)
    context.restore()
  }
}
