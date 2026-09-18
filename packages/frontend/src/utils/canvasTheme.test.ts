import {
  applyCanvasTheme,
  CANVAS_THEME,
  createGridTile,
  GRID_CELL_SIZE,
  GRID_TILE_SIZE,
  LINK_TYPE_COLORS,
  LiteGraph,
  WRAPPED_TEXT_COLOR
} from '@haski/ta-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** WCAG relative luminance of a `#RRGGBB` color. */
const luminance = (hex: string): number => {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('canvas theme', () => {
  afterEach(() => vi.restoreAllMocks())

  it('drives the LiteGraph node fills from one palette', () => {
    expect(LiteGraph.NODE_DEFAULT_BGCOLOR).toBe(CANVAS_THEME.nodeBody)
    expect(LiteGraph.NODE_DEFAULT_COLOR).toBe(CANVAS_THEME.nodeTitle)
  })

  it('keeps nodes distinct from the canvas and text readable on nodes', () => {
    // LiteGraph's stock #222 canvas against the old #2B2D3A body was 1.17:1.
    expect(contrast(CANVAS_THEME.canvas, CANVAS_THEME.nodeBody)).toBeGreaterThan(1.6)
    // The title bar must read as a header, not vanish into the body.
    expect(contrast(CANVAS_THEME.nodeTitle, CANVAS_THEME.nodeBody)).toBeGreaterThan(1.1)
    // Text on the body stays comfortably above WCAG AA for normal text.
    expect(contrast(CANVAS_THEME.nodeBody, WRAPPED_TEXT_COLOR)).toBeGreaterThan(4.5)
    expect(contrast(CANVAS_THEME.nodeBody, LiteGraph.NODE_TEXT_COLOR)).toBeGreaterThan(4.5)
    expect(contrast(CANVAS_THEME.nodeBody, LiteGraph.NODE_TITLE_COLOR)).toBeGreaterThan(4.5)
    // Wires must still show on the darker canvas.
    for (const color of Object.values(LINK_TYPE_COLORS))
      expect(contrast(CANVAS_THEME.canvas, color)).toBeGreaterThan(3)
  })

  it('applies the clear color and a themed grid tile to a canvas', () => {
    const fills: Array<{ style: string; rect: number[] }> = []
    let fillStyle = ''
    const context = {
      set fillStyle(next: string) {
        fillStyle = next
      },
      get fillStyle() {
        return fillStyle
      },
      fillRect: (...rect: number[]) => fills.push({ style: fillStyle, rect })
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,TILE'
    )
    const canvas = {
      clear_background_color: '#222',
      background_image: 'stock-grid.png',
      render_canvas_border: true
    }
    applyCanvasTheme(canvas)
    expect(canvas.clear_background_color).toBe(CANVAS_THEME.canvas)
    expect(canvas.background_image).toBe('data:image/png;base64,TILE')
    expect(canvas.render_canvas_border).toBe(false)
    // Tile: full base fill, 9 fine lines each way, one coarse line each way.
    expect(fills[0]).toEqual({
      style: CANVAS_THEME.canvas,
      rect: [0, 0, GRID_TILE_SIZE, GRID_TILE_SIZE]
    })
    const minor = fills.filter(({ style }) => style === CANVAS_THEME.gridMinor)
    const major = fills.filter(({ style }) => style === CANVAS_THEME.gridMajor)
    expect(minor).toHaveLength((GRID_TILE_SIZE / GRID_CELL_SIZE - 1) * 2)
    expect(major).toHaveLength(2)
  })

  it('leaves the stock tile alone where no 2D context exists', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(createGridTile()).toBeNull()
    const canvas = {
      clear_background_color: '#222',
      background_image: 'stock-grid.png',
      render_canvas_border: true
    }
    applyCanvasTheme(canvas)
    expect(canvas.clear_background_color).toBe(CANVAS_THEME.canvas)
    expect(canvas.background_image).toBe('stock-grid.png')
  })
})
