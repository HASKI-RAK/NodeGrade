import type { LGraphCanvas } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import { hideStockSubgraphChrome } from './subgraphChrome'

type ChromeCanvas = LGraphCanvas & {
  _graph_stack?: unknown[] | null
  drawSubgraphPanel: (ctx: CanvasRenderingContext2D) => void
}

const makeCanvas = () => {
  const seenStacks: unknown[] = []
  const drawSubgraphPanel = vi.fn()
  const canvas = {
    _graph_stack: [{}, {}],
    drawSubgraphPanel,
    drawBackCanvas(this: ChromeCanvas) {
      seenStacks.push(this._graph_stack)
    }
  } as unknown as ChromeCanvas
  return { canvas, seenStacks, drawSubgraphPanel }
}

describe('hideStockSubgraphChrome', () => {
  it('hides the graph stack from the background pass and restores it', () => {
    const { canvas, seenStacks } = makeCanvas()
    const stack = canvas._graph_stack
    hideStockSubgraphChrome(canvas)

    canvas.drawBackCanvas()

    expect(seenStacks).toEqual([[]])
    expect(canvas._graph_stack).toBe(stack)
  })

  it('restores the stack even when the background pass throws', () => {
    const { canvas } = makeCanvas()
    const stack = canvas._graph_stack
    canvas.drawBackCanvas = () => {
      throw new Error('boom')
    }
    hideStockSubgraphChrome(canvas)

    expect(() => canvas.drawBackCanvas()).toThrow('boom')
    expect(canvas._graph_stack).toBe(stack)
  })

  it('drops the Graph Inputs / Graph Outputs panels', () => {
    const { canvas, drawSubgraphPanel } = makeCanvas()
    hideStockSubgraphChrome(canvas)

    canvas.drawSubgraphPanel({} as CanvasRenderingContext2D)

    expect(drawSubgraphPanel).not.toHaveBeenCalled()
  })

  it('installs once', () => {
    const { canvas } = makeCanvas()
    hideStockSubgraphChrome(canvas)
    const drawBackCanvas = canvas.drawBackCanvas
    hideStockSubgraphChrome(canvas)

    expect(canvas.drawBackCanvas).toBe(drawBackCanvas)
  })
})
