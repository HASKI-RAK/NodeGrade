import type { LGraphCanvas, LGraphNode } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import { installNodeSlotText } from './nodeSlotText'

const fixture = (scale: number) => {
  const drawNode = vi.fn()
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn()
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    drawNode,
    ds: { scale },
    editor_alpha: 1,
    inner_text_font: '14px Arial',
    live_mode: false
  } as unknown as LGraphCanvas
  const node = {
    pos: [100, 200],
    flags: {},
    inputs: [
      { name: 'input', label: 'Incoming', type: 'string', link: null },
      { name: 'mixed', type: 'message,string', link: null }
    ],
    outputs: [{ name: 'Outgoing', type: 'string', links: null }],
    getConnectionPos: vi.fn((input: boolean, index: number, position: number[]) => {
      position[0] = input ? 100 : 300
      position[1] = 230 + index * 20
      return position
    })
  } as unknown as LGraphNode
  return { canvas, context, drawNode, node }
}

describe('node slot text', () => {
  it('keeps input and output labels visible below LiteGraph’s zoom cutoff', () => {
    const { canvas, context, drawNode, node } = fixture(0.5)
    installNodeSlotText(canvas)

    canvas.drawNode(node, context)

    expect(drawNode).toHaveBeenCalledWith(node, context)
    expect(context.fillText).toHaveBeenCalledWith('Incoming', 10, 35)
    expect(context.fillText).toHaveBeenCalledWith('Outgoing', 190, 35)
    expect(context.fillText).toHaveBeenCalledTimes(2)
    expect(context.restore).toHaveBeenCalledOnce()
  })

  it('lets LiteGraph draw labels at normal zoom without duplicates', () => {
    const { canvas, context, drawNode, node } = fixture(0.6)
    installNodeSlotText(canvas)
    installNodeSlotText(canvas)

    canvas.drawNode(node, context)

    expect(drawNode).toHaveBeenCalledOnce()
    expect(context.fillText).not.toHaveBeenCalled()
  })

  it('keeps horizontal slot labels above their ports', () => {
    const { canvas, context, node } = fixture(0.5)
    node.horizontal = true
    installNodeSlotText(canvas)

    canvas.drawNode(node, context)

    expect(context.fillText).toHaveBeenCalledWith('Incoming', 0, 20)
    expect(context.fillText).toHaveBeenCalledWith('Outgoing', 200, 22)
  })
})
