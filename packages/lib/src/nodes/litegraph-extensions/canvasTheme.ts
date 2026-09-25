/* eslint-disable immutable/no-mutation */
import type { LGraphCanvas } from 'litegraph.js'

import { CANVAS_THEME } from './LGraphNode'

/** Grid geometry LiteGraph's stock tile uses: 100-unit tile, 10-unit cells. */
export const GRID_TILE_SIZE = 100
export const GRID_CELL_SIZE = 10

const normalizePixelRatio = (pixelRatio: number): number =>
  Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1

/**
 * Build the grid tile matching LiteGraph's stock pattern (fine lines every 10
 * units, one coarse line on the tile edge) in the theme colors. The tile
 * covers 100 graph units; at `pixelRatio` above 1 it is drawn with that many
 * device pixels per unit and whole-pixel hairlines, so a pattern scaled back
 * to the 100-unit period stays crisp on scaled displays instead of being
 * resampled from a 1x raster.
 *
 * Returns `null` where no 2D context exists (server, jsdom) so callers can
 * leave LiteGraph's default tile in place instead of breaking.
 */
export const createGridTile = (pixelRatio = 1): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') return null
  const ratio = normalizePixelRatio(pixelRatio)
  const size = Math.max(1, Math.round(GRID_TILE_SIZE * ratio))
  const line = Math.max(1, Math.round(ratio))
  const cells = GRID_TILE_SIZE / GRID_CELL_SIZE
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const context = tile.getContext('2d')
  if (!context) return null
  context.fillStyle = CANVAS_THEME.canvas
  context.fillRect(0, 0, size, size)
  context.fillStyle = CANVAS_THEME.gridMinor
  for (let cell = 1; cell < cells; cell += 1) {
    const offset = Math.round((cell * size) / cells)
    context.fillRect(offset, 0, line, size)
    context.fillRect(0, offset, size, line)
  }
  context.fillStyle = CANVAS_THEME.gridMajor
  context.fillRect(0, 0, line, size)
  context.fillRect(0, 0, size, line)
  return tile
}

/**
 * Repeating grid pattern in graph units, rasterised at `pixelRatio` device
 * pixels per unit. `null` where no 2D context exists.
 */
export const createGridPattern = (pixelRatio = 1): CanvasPattern | null => {
  const tile = createGridTile(pixelRatio)
  if (!tile) return null
  const pattern = tile.getContext('2d')?.createPattern(tile, 'repeat')
  if (!pattern) return null
  // The tile is `size` device pixels wide but must repeat every 100 units.
  const scale = GRID_TILE_SIZE / tile.width
  pattern.setTransform({ a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 })
  return pattern
}

/**
 * The runtime fields `applyCanvasTheme` touches. `clear_background_color`
 * (default `"#222"`) and `_pattern` (the cached background pattern) exist on
 * `LGraphCanvas` at runtime but are missing from the shipped `.d.ts`, hence
 * the structural type instead of `Pick`.
 */
type ThemableCanvas = Pick<LGraphCanvas, 'background_image' | 'render_canvas_border'> & {
  clear_background_color?: string
  _pattern?: CanvasPattern | null
}

export type CanvasThemeOptions = {
  /** Device pixels per CSS pixel the canvas renders at. Default 1. */
  pixelRatio?: number
}

/**
 * Apply the surface palette to an `LGraphCanvas`. Node colors are global
 * (`LiteGraph.NODE_DEFAULT_*`, set in `LGraphRegisterCustomNodes`), but the
 * background is per canvas instance, so the editor calls this after
 * constructing its canvas and again when the pixel ratio changes. Idempotent.
 */
export const applyCanvasTheme = (
  canvas: ThemableCanvas,
  { pixelRatio = 1 }: CanvasThemeOptions = {}
): void => {
  canvas.clear_background_color = CANVAS_THEME.canvas
  // LiteGraph rasterises `background_image` at one image pixel per graph
  // unit, so keep a 1x tile there as the fallback it understands...
  const tile = createGridTile()
  if (tile) canvas.background_image = tile.toDataURL('image/png')
  // ...and seed its pattern cache with the device-resolution version, which it
  // otherwise builds from that image on first draw and reuses for the
  // lifetime of the canvas.
  const pattern = createGridPattern(pixelRatio)
  if (pattern) canvas._pattern = pattern
  // LiteGraph strokes a "#235" frame around the viewport by default; the
  // editor chrome already frames the canvas.
  canvas.render_canvas_border = false
}
