/* eslint-disable immutable/no-mutation */
import type { LGraphCanvas } from 'litegraph.js'

import { CANVAS_THEME } from './LGraphNode'

/** Grid geometry LiteGraph's stock tile uses: 100-unit tile, 10-unit cells. */
export const GRID_TILE_SIZE = 100
export const GRID_CELL_SIZE = 10

/**
 * Build a 100x100 grid tile matching LiteGraph's stock pattern (fine lines
 * every 10 units, one coarse line on the tile edge) in the theme colors.
 * Returns `null` where no 2D context exists (server, jsdom) so callers can
 * leave LiteGraph's default tile in place instead of breaking.
 */
export const createGridTile = (): string | null => {
  if (typeof document === 'undefined') return null
  const tile = document.createElement('canvas')
  tile.width = GRID_TILE_SIZE
  tile.height = GRID_TILE_SIZE
  const context = tile.getContext('2d')
  if (!context) return null
  context.fillStyle = CANVAS_THEME.canvas
  context.fillRect(0, 0, GRID_TILE_SIZE, GRID_TILE_SIZE)
  context.fillStyle = CANVAS_THEME.gridMinor
  for (let offset = GRID_CELL_SIZE; offset < GRID_TILE_SIZE; offset += GRID_CELL_SIZE) {
    context.fillRect(offset, 0, 1, GRID_TILE_SIZE)
    context.fillRect(0, offset, GRID_TILE_SIZE, 1)
  }
  context.fillStyle = CANVAS_THEME.gridMajor
  context.fillRect(0, 0, 1, GRID_TILE_SIZE)
  context.fillRect(0, 0, GRID_TILE_SIZE, 1)
  return tile.toDataURL('image/png')
}

/**
 * The runtime fields `applyCanvasTheme` touches. `clear_background_color`
 * exists on `LGraphCanvas` at runtime (default `"#222"`) but is missing from
 * the shipped `.d.ts`, hence the structural type instead of `Pick`.
 */
type ThemableCanvas = Pick<LGraphCanvas, 'background_image' | 'render_canvas_border'> & {
  clear_background_color?: string
}

/**
 * Apply the surface palette to an `LGraphCanvas`. Node colors are global
 * (`LiteGraph.NODE_DEFAULT_*`, set in `LGraphRegisterCustomNodes`), but the
 * background is per canvas instance, so the editor calls this once after
 * constructing its canvas. Idempotent.
 */
export const applyCanvasTheme = (canvas: ThemableCanvas): void => {
  canvas.clear_background_color = CANVAS_THEME.canvas
  const tile = createGridTile()
  if (tile) canvas.background_image = tile
  // LiteGraph strokes a "#235" frame around the viewport by default; the
  // editor chrome already frames the canvas.
  canvas.render_canvas_border = false
}
