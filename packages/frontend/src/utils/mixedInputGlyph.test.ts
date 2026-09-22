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
    fill: vi.fn()
  } as unknown as CanvasRenderingContext2D
  const canvas = { drawNode, live_mode: false } as unknown as LGraphCanvas
  const node = {
    pos: [100, 200],
    flags: {},
    inputs: [
      { name: 'message', type: 'message,string,[message]', link: null },
      {
        name: 'messages',
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
  it('overlays the string circle on a mixed message arrow', () => {
    const { canvas, context, drawNode, node } = fixture()
    installMixedInputGlyph(canvas)

    canvas.drawNode(node, context)

    expect(drawNode).toHaveBeenCalledWith(node, context)
    expect(context.fillStyle).toBe(LINK_TYPE_COLORS.string)
    expect(context.arc).toHaveBeenCalledWith(
      -1,
      30,
      MIXED_INPUT_GLYPH_RADIUS,
      0,
      Math.PI * 2
    )
    expect(context.arc).toHaveBeenCalledWith(
      -1,
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
