import type { LGraphCanvas, LGraphNode } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import { LINK_TYPE_COLORS } from '@haski/ta-lib'

import { installMixedInputGlyph, MIXED_INPUT_GLYPH_RADIUS } from './mixedInputGlyph'

const fixture = () => {
  const drawNode = vi.fn()
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 5 }))
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    drawNode,
    ds: { scale: 1 },
    inner_text_font: '14px Arial',
    live_mode: false
  } as unknown as LGraphCanvas
  const node = {
    pos: [100, 200],
    flags: {},
    inputs: [
      {
        name: 'message',
        label: 'message | string',
        type: 'message,string,[message]',
        link: null
      },
      {
        name: 'messages',
        label: 'messages | strings',
        type: 'message,[message],[string],string',
        link: null
      },
      { name: 'number', type: 'number', link: null }
    ],
    getConnectionPos: vi.fn((_input, index, output) => {
      output[0] = 100
      output[1] = 230 + index * 20
      return output
    })
  } as unknown as LGraphNode

  return { canvas, context, drawNode, node }
}

describe('mixed input glyph', () => {
  it('draws separated message and string legends after the stock arrows', () => {
    const { canvas, context, drawNode, node } = fixture()
    drawNode.mockImplementation((drawnNode: LGraphNode) => {
      expect(drawnNode.inputs?.map(({ label }) => label)).toEqual(['', '', undefined])
    })
    installMixedInputGlyph(canvas)

    canvas.drawNode(node, context)

    expect(drawNode).toHaveBeenCalledWith(node, context)
    expect(node.inputs?.map(({ label }) => label)).toEqual([
      'message | string',
      'messages | strings',
      undefined
    ])
    expect(context.fillText).toHaveBeenNthCalledWith(1, 'message', 10, 35)
    expect(context.fillText).toHaveBeenNthCalledWith(2, ' | ', 45, 35)
    expect(context.fillText).toHaveBeenNthCalledWith(3, 'string', 72, 35)
    expect(context.fillText).toHaveBeenNthCalledWith(4, 'messages', 10, 55)
    expect(context.fillText).toHaveBeenNthCalledWith(5, ' | ', 50, 55)
    expect(context.fillText).toHaveBeenNthCalledWith(6, 'strings', 77, 55)
    expect(context.arc).toHaveBeenCalledWith(
      64,
      30,
      MIXED_INPUT_GLYPH_RADIUS,
      0,
      Math.PI * 2
    )
    expect(context.arc).toHaveBeenCalledWith(
      69,
      50,
      MIXED_INPUT_GLYPH_RADIUS,
      0,
      Math.PI * 2
    )
    expect(context.fill).toHaveBeenCalledTimes(2)
  })

  it('installs once and leaves single-type ports unchanged', () => {
    const { canvas, context, drawNode, node } = fixture()
    node.inputs = [{ name: 'message', type: 'message', link: null }]
    installMixedInputGlyph(canvas)
    installMixedInputGlyph(canvas)

    canvas.drawNode(node, context)

    expect(drawNode).toHaveBeenCalledOnce()
    expect(context.arc).not.toHaveBeenCalled()
  })
})
