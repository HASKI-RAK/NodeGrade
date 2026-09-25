import {
  applyCanvasTheme,
  CANVAS_THEME,
  createGridPattern,
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

  /**
   * Record every fill on a fake 2D context, grouped per canvas so the 1x
   * fallback tile and the device-resolution tile stay distinguishable.
   */
  const stubContexts = () => {
    const tiles: Array<{ size: number; fills: Array<{ style: string; rect: number[] }> }> =
      []
    const patterns: Array<{ image: HTMLCanvasElement; transform?: DOMMatrix2DInit }> = []
    // Like the browser, one context per element however often it is asked for.
    const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement
    ) {
      const existing = contexts.get(this)
      if (existing) return existing
      const tile = { size: this.width, fills: [] as Array<{ style: string; rect: number[] }> }
      tiles.push(tile)
      let fillStyle = ''
      const context = {
        set fillStyle(next: string) {
          fillStyle = next
        },
        get fillStyle() {
          return fillStyle
        },
        fillRect: (...rect: number[]) => tile.fills.push({ style: fillStyle, rect }),
        createPattern: (image: HTMLCanvasElement) => {
          const pattern = {
            image,
            setTransform(transform?: DOMMatrix2DInit) {
              pattern.transform = transform
            }
          } as { image: HTMLCanvasElement; transform?: DOMMatrix2DInit }
          patterns.push(pattern)
          return pattern as unknown as CanvasPattern
        }
      } as unknown as CanvasRenderingContext2D
      contexts.set(this, context)
      return context
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,TILE'
    )
    return { tiles, patterns }
  }

  const themableCanvas = () => ({
    clear_background_color: '#222',
    background_image: 'stock-grid.png',
    render_canvas_border: true,
    _pattern: null as CanvasPattern | null
  })

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
    const { tiles, patterns } = stubContexts()
    const canvas = themableCanvas()
    applyCanvasTheme(canvas)
    expect(canvas.clear_background_color).toBe(CANVAS_THEME.canvas)
    expect(canvas.background_image).toBe('data:image/png;base64,TILE')
    expect(canvas.render_canvas_border).toBe(false)
    // Tile: full base fill, 9 fine lines each way, one coarse line each way.
    const [tile] = tiles
    expect(tile.fills[0]).toEqual({
      style: CANVAS_THEME.canvas,
      rect: [0, 0, GRID_TILE_SIZE, GRID_TILE_SIZE]
    })
    const minor = tile.fills.filter(({ style }) => style === CANVAS_THEME.gridMinor)
    const major = tile.fills.filter(({ style }) => style === CANVAS_THEME.gridMajor)
    expect(minor).toHaveLength((GRID_TILE_SIZE / GRID_CELL_SIZE - 1) * 2)
    expect(major).toHaveLength(2)
    // LiteGraph's pattern cache is seeded so the grid shows on the first frame
    // instead of after the background image decodes; at 1x it is the same tile.
    expect(canvas._pattern).toBe(patterns[0])
    expect(patterns[0].transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  })

  it('rasterises the grid at the device pixel ratio with whole-pixel hairlines', () => {
    const { tiles } = stubContexts()
    const tile = createGridTile(1.5)
    expect(tile?.width).toBe(150)
    const [drawn] = tiles
    expect(drawn.fills[0].rect).toEqual([0, 0, 150, 150])
    // Cells land on whole device pixels (15 apart) and lines are 2 px wide,
    // the nearest integer to 1.5 CSS px - never a 1.5 px smear.
    const minor = drawn.fills.filter(({ style }) => style === CANVAS_THEME.gridMinor)
    expect(minor.map(({ rect }) => rect)).toContainEqual([15, 0, 2, 150])
    expect(minor.map(({ rect }) => rect)).toContainEqual([0, 135, 150, 2])
    expect(minor.every(({ rect }) => Number.isInteger(rect[0]) && Number.isInteger(rect[1])))
      .toBe(true)
    const major = drawn.fills.filter(({ style }) => style === CANVAS_THEME.gridMajor)
    expect(major.map(({ rect }) => rect)).toEqual([
      [0, 0, 2, 150],
      [0, 0, 150, 2]
    ])
  })

  it('seeds a pattern that repeats every 100 units regardless of the ratio', () => {
    const { tiles, patterns } = stubContexts()
    const canvas = themableCanvas()
    applyCanvasTheme(canvas, { pixelRatio: 2 })
    // The 1x tile stays behind `background_image` as LiteGraph's fallback; the
    // pattern comes from the 200 px tile scaled back to the 100-unit period.
    expect(tiles.map(({ size }) => size)).toEqual([GRID_TILE_SIZE, 200])
    expect(canvas.background_image).toBe('data:image/png;base64,TILE')
    expect(canvas._pattern).toBe(patterns[0])
    expect(patterns[0].image.width).toBe(200)
    expect(patterns[0].transform).toEqual({ a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 })
  })

  it('leaves the stock tile alone where no 2D context exists', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(createGridTile()).toBeNull()
    expect(createGridPattern(2)).toBeNull()
    const canvas = themableCanvas()
    applyCanvasTheme(canvas)
    expect(canvas.clear_background_color).toBe(CANVAS_THEME.canvas)
    expect(canvas.background_image).toBe('stock-grid.png')
    expect(canvas._pattern).toBeNull()
  })
})
