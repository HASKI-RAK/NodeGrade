import type { LGraphCanvas, LGraphNode } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import {
  installNodeConnectionHighlight,
  NODE_CONNECTION_HIGHLIGHT_COLOR,
  NODE_CONNECTION_HIGHLIGHT_WIDTH
} from './nodeConnectionHighlight'

const node = (overrides: Partial<LGraphNode> = {}): LGraphNode =>
  ({
    id: 1,
    inputs: [{ name: 'in', type: 'string', link: 11 }],
    outputs: [{ name: 'out', type: 'string', links: [12, 13] }],
    flags: {},
    is_selected: false,
    mouseOver: false,
    ...overrides
  }) as LGraphNode

const canvas = (nodes: LGraphNode[]) => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    stroke: vi.fn()
  } as unknown as CanvasRenderingContext2D
  const renderLink = vi.fn()
  const drawNodeShape = vi.fn()
  const drawFrontCanvas = vi.fn()
  const drawBackCanvas = vi.fn()
  const value = {
    graph: { _nodes: nodes },
    highlighted_links: {},
    connections_width: 3,
    dirty_bgcanvas: false,
    drawFrontCanvas,
    drawBackCanvas,
    drawNodeShape,
    renderLink,
    round_radius: 8
  } as unknown as LGraphCanvas

  return { value, context, renderLink, drawNodeShape, drawFrontCanvas, drawBackCanvas }
}

describe('node and connection highlighting', () => {
  it('highlights every link attached to a hovered node', () => {
    const fixture = canvas([node({ mouseOver: true })])
    installNodeConnectionHighlight(fixture.value)

    fixture.value.drawFrontCanvas()

    expect(fixture.value.highlighted_links).toEqual({ 11: true, 12: true, 13: true })
    expect(fixture.drawBackCanvas).toHaveBeenCalledOnce()
    expect(fixture.drawFrontCanvas).toHaveBeenCalledOnce()
  })

  it('draws an accent outline for hovered and selected nodes', () => {
    const fixture = canvas([])
    installNodeConnectionHighlight(fixture.value)

    fixture.value.drawNodeShape(
      node(),
      fixture.context,
      [160, 80],
      '#000000',
      '#111111',
      false,
      true
    )

    expect(fixture.context.strokeStyle).toBe(NODE_CONNECTION_HIGHLIGHT_COLOR)
    expect(fixture.context.globalAlpha).toBe(1)
    expect(fixture.context.lineWidth).toBe(3)
    expect(fixture.context.stroke).toHaveBeenCalledOnce()
  })

  it('renders highlighted links with the accent color and wider stroke', () => {
    const fixture = canvas([])
    fixture.value.highlighted_links = { 12: true }
    installNodeConnectionHighlight(fixture.value)

    const renderHighlightedLink = fixture.value.renderLink as unknown as (
      context: CanvasRenderingContext2D,
      start: [number, number],
      end: [number, number],
      link: { id: number },
      skipBorder: boolean,
      flow: number
    ) => void
    renderHighlightedLink(
      fixture.context,
      [0, 0],
      [100, 100],
      { id: 12 },
      false,
      0
    )

    expect(fixture.renderLink).toHaveBeenCalledWith(
      fixture.context,
      [0, 0],
      [100, 100],
      { id: 12 },
      false,
      0,
      NODE_CONNECTION_HIGHLIGHT_COLOR
    )
    expect(fixture.value.connections_width).toBe(3)
    expect(NODE_CONNECTION_HIGHLIGHT_WIDTH).toBeGreaterThan(3)
  })
})
