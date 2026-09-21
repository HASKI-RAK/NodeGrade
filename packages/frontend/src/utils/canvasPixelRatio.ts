import type { LGraphCanvas, LGraphNode, Vector2, Vector4 } from 'litegraph.js'

/**
 * Render the LiteGraph canvas at the device pixel ratio.
 *
 * LiteGraph 0.7 sizes its bitmap in CSS pixels: `resize(w, h)` writes them
 * straight to `canvas.width/height`, so on a 125-200% display the browser
 * upsamples every glyph, wire and border while the DOM `<textarea>` of the
 * inline editor stays crisp. This installer keeps LiteGraph's screen
 * coordinate system in CSS pixels - what `adjustMouseEvent`,
 * `convertOffsetToCanvas` and the inline editor already assume - and hides
 * a denser backing store behind a base `scale(ratio, ratio)` transform.
 *
 * Where the transform lives: `drawBackCanvas` resets its context to identity
 * every frame right before `ds.toCanvasContext`, and both layers wrap their
 * graph-space drawing in save/restore around that call, so scaling inside
 * `toCanvasContext` covers nodes, links, groups and the grid on both layers
 * and survives the reset. The front layer's `drawImage(bgcanvas, 0, 0)` runs
 * at identity and copies backing pixels 1:1. `renderInfo` is the one
 * remaining screen-space drawing and is wrapped on its own.
 *
 * After installation `canvas.canvas.width/height` are backing pixels.
 * LiteGraph's own readers of that size (`centerOnNode`,
 * `DragAndScale.computeVisibleArea`) are replaced with CSS-size versions;
 * application code should go through `canvasCssSize`/`canvasViewportCenter`.
 */

type PixelRatioState = {
  pixelRatio: () => number
  onRatioChange?: (ratio: number) => void
  ratio: number
  cssWidth: number
  cssHeight: number
}

type PixelRatioCanvas = LGraphCanvas & {
  __canvasPixelRatio?: PixelRatioState
}

export type CanvasPixelRatioOptions = {
  /** Ratio source, re-read on every resize. Default `window.devicePixelRatio`. */
  pixelRatio?: () => number
  /**
   * Called after a resize applied a different ratio than before, for raster
   * assets that have to be rebuilt at the new density (the grid tile).
   */
  onRatioChange?: (ratio: number) => void
}

const readDevicePixelRatio = (): number =>
  typeof window === 'undefined' ? 1 : window.devicePixelRatio

const normalizeRatio = (ratio: number): number =>
  Number.isFinite(ratio) && ratio > 0 ? ratio : 1

/**
 * Install DPR-aware sizing on a canvas. Idempotent. The ratio is re-read on
 * every `resize`, so a ratio change only needs `refreshCanvasPixelRatio` (see
 * `watchDevicePixelRatio`).
 */
export const installCanvasPixelRatio = (
  canvas: LGraphCanvas,
  { pixelRatio = readDevicePixelRatio, onRatioChange }: CanvasPixelRatioOptions = {}
): void => {
  const runtime = canvas as PixelRatioCanvas
  if (runtime.__canvasPixelRatio) return
  // Until the first resize the bitmap is whatever LiteGraph left: treat it as
  // ratio 1 so drawing and hit-testing stay consistent with each other.
  const state: PixelRatioState = {
    pixelRatio,
    onRatioChange,
    ratio: 1,
    cssWidth: canvas.canvas.width,
    cssHeight: canvas.canvas.height
  }
  runtime.__canvasPixelRatio = state

  const applySize = (cssWidth: number, cssHeight: number): void => {
    const ratio = normalizeRatio(state.pixelRatio())
    const ratioChanged = ratio !== state.ratio
    state.cssWidth = cssWidth
    state.cssHeight = cssHeight
    state.ratio = ratio
    const backingWidth = Math.round(cssWidth * ratio)
    const backingHeight = Math.round(cssHeight * ratio)
    const element = canvas.canvas
    const sizeChanged = element.width !== backingWidth || element.height !== backingHeight
    if (sizeChanged) {
      element.width = backingWidth
      element.height = backingHeight
      canvas.bgcanvas.width = backingWidth
      canvas.bgcanvas.height = backingHeight
    }
    if (ratioChanged) state.onRatioChange?.(ratio)
    if (sizeChanged || ratioChanged) canvas.setDirty(true, true)
  }

  // Same contract as LiteGraph's: explicit CSS size, or measure the parent.
  canvas.resize = (width?: number, height?: number) => {
    if (!width && !height) {
      const host = canvas.canvas.parentElement
      applySize(
        host?.offsetWidth ?? state.cssWidth,
        host?.offsetHeight ?? state.cssHeight
      )
      return
    }
    applySize(width ?? 0, height ?? 0)
  }

  const ds = canvas.ds
  const toCanvasContext = ds.toCanvasContext.bind(ds)
  ds.toCanvasContext = (ctx) => {
    ctx.scale(state.ratio, state.ratio)
    toCanvasContext(ctx)
  }

  // LiteGraph derives the visible graph rectangle from the bitmap size; with
  // a denser bitmap that over-reports the viewport by ratio^2 and culls
  // nothing, so compute it from the CSS size instead.
  ds.computeVisibleArea = (viewport?: Vector4) => {
    const startX = -ds.offset[0] + (viewport ? viewport[0] / ds.scale : 0)
    const startY = -ds.offset[1] + (viewport ? viewport[1] / ds.scale : 0)
    const width = viewport ? viewport[2] : state.cssWidth
    const height = viewport ? viewport[3] : state.cssHeight
    ds.visible_area[0] = startX
    ds.visible_area[1] = startY
    ds.visible_area[2] = width / ds.scale
    ds.visible_area[3] = height / ds.scale
  }

  canvas.centerOnNode = (node: LGraphNode) => {
    ds.offset[0] = -node.pos[0] - node.size[0] * 0.5 + (state.cssWidth * 0.5) / ds.scale
    ds.offset[1] = -node.pos[1] - node.size[1] * 0.5 + (state.cssHeight * 0.5) / ds.scale
    canvas.setDirty(true, true)
  }

  // Stats readout in the corner: drawn outside the graph transform, so give
  // it the base scale and a CSS-pixel anchor (LiteGraph passes 0,0 and falls
  // back to `canvas.height - 80`, which would now be backing pixels).
  const renderInfo = canvas.renderInfo.bind(canvas)
  canvas.renderInfo = (ctx, x, y) => {
    ctx.save()
    ctx.scale(state.ratio, state.ratio)
    renderInfo(ctx, x || 10, y || state.cssHeight - 80)
    ctx.restore()
  }
}

/** Re-apply the current pixel ratio to the last CSS size the canvas was given. */
export const refreshCanvasPixelRatio = (canvas: LGraphCanvas): void => {
  const state = (canvas as PixelRatioCanvas).__canvasPixelRatio
  if (!state) return
  canvas.resize(state.cssWidth, state.cssHeight)
}

/**
 * Visible size of the canvas in CSS pixels, LiteGraph's screen coordinate
 * space. Falls back to the bitmap size on a canvas without the installer,
 * where the two coincide.
 */
export const canvasCssSize = (canvas: LGraphCanvas): Vector2 => {
  const state = (canvas as PixelRatioCanvas).__canvasPixelRatio
  return state
    ? [state.cssWidth, state.cssHeight]
    : [canvas.canvas.width, canvas.canvas.height]
}

/** Graph-space point under the middle of the visible canvas. */
export const canvasViewportCenter = (canvas: LGraphCanvas): Vector2 => {
  const [width, height] = canvasCssSize(canvas)
  return canvas.convertCanvasToOffset([width / 2, height / 2])
}

/**
 * Call `onChange` whenever `window.devicePixelRatio` changes (window dragged
 * to a monitor with different scaling, browser zoom). A `resolution` media
 * query matches only the current ratio, so its first `change` event marks
 * the switch; the query is then re-armed for the new ratio. Returns the
 * unsubscribe function.
 */
export const watchDevicePixelRatio = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  let media: MediaQueryList | null = null
  const handleChange = (): void => {
    arm()
    onChange()
  }
  const arm = (): void => {
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    media.addEventListener('change', handleChange, { once: true })
  }
  arm()
  return () => media?.removeEventListener('change', handleChange)
}
