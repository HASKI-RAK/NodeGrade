import type { LGraphCanvas, LGraphNode, Vector2, Vector4 } from 'litegraph.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  canvasCssSize,
  canvasViewportCenter,
  installCanvasPixelRatio,
  refreshCanvasPixelRatio,
  watchDevicePixelRatio
} from './canvasPixelRatio'

type Fixture = {
  canvas: LGraphCanvas
  element: HTMLCanvasElement
  bgcanvas: HTMLCanvasElement
  ds: {
    offset: Vector2
    scale: number
    visible_area: Vector4
    toCanvasContext: (ctx: CanvasRenderingContext2D) => void
    computeVisibleArea: (viewport?: Vector4) => void
  }
  setDirty: ReturnType<typeof vi.fn>
  renderInfo: ReturnType<typeof vi.fn>
}

// Hand-written double: the real LGraphCanvas needs a 2D context jsdom lacks.
// `toCanvasContext`/`resize` mirror LiteGraph 0.7.18 so the wrappers are
// exercised against the behaviour they extend.
const makeCanvas = (backing: [number, number] = [300, 150]): Fixture => {
  const element = document.createElement('canvas')
  element.width = backing[0]
  element.height = backing[1]
  const bgcanvas = document.createElement('canvas')
  bgcanvas.width = backing[0]
  bgcanvas.height = backing[1]
  const ds: Fixture['ds'] = {
    offset: [0, 0],
    scale: 1,
    visible_area: [0, 0, 0, 0],
    toCanvasContext(ctx) {
      ctx.scale(this.scale, this.scale)
      ctx.translate(this.offset[0], this.offset[1])
    },
    computeVisibleArea() {}
  }
  const setDirty = vi.fn()
  const renderInfo = vi.fn()
  const canvas = {
    canvas: element,
    bgcanvas,
    ds,
    setDirty,
    renderInfo,
    resize(width?: number, height?: number) {
      element.width = width ?? 0
      element.height = height ?? 0
    },
    centerOnNode() {},
    convertCanvasToOffset: (pos: Vector2): Vector2 => [
      pos[0] / ds.scale - ds.offset[0],
      pos[1] / ds.scale - ds.offset[1]
    ]
  } as unknown as LGraphCanvas
  return { canvas, element, bgcanvas, ds, setDirty, renderInfo }
}

const fakeContext = () => {
  const calls: string[] = []
  return {
    calls,
    ctx: {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      scale: (x: number, y: number) => calls.push(`scale ${x} ${y}`),
      translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`)
    } as unknown as CanvasRenderingContext2D
  }
}

describe('installCanvasPixelRatio', () => {
  it('sizes both bitmaps at the ratio while reporting the CSS size', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })

    fixture.canvas.resize(800, 600)

    expect([fixture.element.width, fixture.element.height]).toEqual([1600, 1200])
    expect([fixture.bgcanvas.width, fixture.bgcanvas.height]).toEqual([1600, 1200])
    expect(canvasCssSize(fixture.canvas)).toEqual([800, 600])
    expect(fixture.setDirty).toHaveBeenCalledWith(true, true)
  })

  it('rounds fractional layout sizes to whole device pixels', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 1.25 })

    fixture.canvas.resize(1234.4, 777.7)

    expect([fixture.element.width, fixture.element.height]).toEqual([1543, 972])
    expect(canvasCssSize(fixture.canvas)).toEqual([1234.4, 777.7])
  })

  it('leaves the bitmap alone when nothing changed', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    fixture.canvas.resize(800, 600)
    fixture.setDirty.mockClear()

    fixture.canvas.resize(800, 600)

    expect(fixture.setDirty).not.toHaveBeenCalled()
  })

  it('measures the parent when called without a size, like LiteGraph', () => {
    const fixture = makeCanvas()
    const host = document.createElement('div')
    Object.defineProperty(host, 'offsetWidth', { get: () => 640 })
    Object.defineProperty(host, 'offsetHeight', { get: () => 480 })
    host.appendChild(fixture.element)
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })

    fixture.canvas.resize()

    expect([fixture.element.width, fixture.element.height]).toEqual([1280, 960])
    expect(canvasCssSize(fixture.canvas)).toEqual([640, 480])
  })

  it('applies the ratio before pan and zoom on both layers', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    fixture.canvas.resize(800, 600)
    fixture.ds.scale = 0.5
    fixture.ds.offset = [40, 30]
    const { ctx, calls } = fakeContext()

    fixture.ds.toCanvasContext(ctx)

    expect(calls).toEqual(['scale 2 2', 'scale 0.5 0.5', 'translate 40 30'])
  })

  it('computes the visible graph area from CSS pixels', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    fixture.canvas.resize(800, 600)
    fixture.ds.scale = 2
    fixture.ds.offset = [-100, -50]

    fixture.ds.computeVisibleArea()

    // Viewport of 800x600 CSS px at zoom 2 shows 400x300 graph units from
    // (100, 50); the 1600x1200 bitmap must not leak into this.
    expect([...fixture.ds.visible_area]).toEqual([100, 50, 400, 300])
  })

  it('honours an explicit viewport rectangle', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    fixture.canvas.resize(800, 600)
    fixture.ds.scale = 1
    fixture.ds.offset = [0, 0]

    fixture.ds.computeVisibleArea([10, 20, 300, 200])

    expect([...fixture.ds.visible_area]).toEqual([10, 20, 300, 200])
  })

  it('centers a node in the CSS viewport', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    fixture.canvas.resize(800, 600)
    fixture.ds.scale = 1
    const node = { pos: [100, 100], size: [200, 100] } as unknown as LGraphNode

    fixture.canvas.centerOnNode(node)

    // Node center (200, 150) lands at the middle of 800x600, not 1600x1200.
    expect([...fixture.ds.offset]).toEqual([200, 150])
    expect(fixture.setDirty).toHaveBeenLastCalledWith(true, true)
  })

  it('draws the stats readout under the base scale at a CSS anchor', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    fixture.canvas.resize(800, 600)
    const { ctx, calls } = fakeContext()

    fixture.canvas.renderInfo(ctx, 0, 0)

    expect(calls).toEqual(['save', 'scale 2 2', 'restore'])
    expect(fixture.renderInfo).toHaveBeenCalledWith(ctx, 10, 520)
  })

  it('re-applies a changed ratio to the last CSS size', () => {
    let ratio = 1
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => ratio })
    fixture.canvas.resize(800, 600)
    expect([fixture.element.width, fixture.element.height]).toEqual([800, 600])
    fixture.setDirty.mockClear()

    ratio = 1.5
    refreshCanvasPixelRatio(fixture.canvas)

    expect([fixture.element.width, fixture.element.height]).toEqual([1200, 900])
    expect(canvasCssSize(fixture.canvas)).toEqual([800, 600])
    expect(fixture.setDirty).toHaveBeenCalledWith(true, true)
  })

  it('installs once', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    const resize = fixture.canvas.resize
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 3 })

    expect(fixture.canvas.resize).toBe(resize)
    fixture.canvas.resize(100, 100)
    expect(fixture.element.width).toBe(200)
  })

  it('reports ratio changes once each, before the redraw is requested', () => {
    let ratio = 2
    const order: string[] = []
    const fixture = makeCanvas()
    fixture.setDirty.mockImplementation(() => order.push('dirty'))
    installCanvasPixelRatio(fixture.canvas, {
      pixelRatio: () => ratio,
      onRatioChange: (next) => order.push(`ratio ${next}`)
    })

    fixture.canvas.resize(800, 600)
    fixture.canvas.resize(640, 480)
    ratio = 1
    refreshCanvasPixelRatio(fixture.canvas)

    // First resize switches 1 -> 2, the second keeps 2, the refresh goes back
    // to 1; the raster asset is rebuilt before the frame that will use it.
    expect(order).toEqual(['ratio 2', 'dirty', 'dirty', 'ratio 1', 'dirty'])
  })

  it('falls back to a sane ratio for bogus values', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => Number.NaN })

    fixture.canvas.resize(800, 600)

    expect([fixture.element.width, fixture.element.height]).toEqual([800, 600])
  })
})

describe('canvasCssSize / canvasViewportCenter', () => {
  it('equal the bitmap size on a canvas without the installer', () => {
    const fixture = makeCanvas([800, 600])

    expect(canvasCssSize(fixture.canvas)).toEqual([800, 600])
    expect(canvasViewportCenter(fixture.canvas)).toEqual([400, 300])
  })

  it('map the middle of the CSS viewport into graph space', () => {
    const fixture = makeCanvas()
    installCanvasPixelRatio(fixture.canvas, { pixelRatio: () => 2 })
    fixture.canvas.resize(800, 600)
    fixture.ds.scale = 2
    fixture.ds.offset = [-50, -25]

    expect(canvasViewportCenter(fixture.canvas)).toEqual([250, 175])
  })
})

describe('watchDevicePixelRatio', () => {
  const originalMatchMedia = window.matchMedia
  const originalRatio = window.devicePixelRatio

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: originalRatio
    })
  })

  const stubMatchMedia = () => {
    const queries: Array<{ query: string; listeners: Set<() => void> }> = []
    window.matchMedia = vi.fn((query: string) => {
      const entry = { query, listeners: new Set<() => void>() }
      queries.push(entry)
      return {
        matches: true,
        media: query,
        addEventListener: (_type: string, listener: () => void) =>
          entry.listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          entry.listeners.delete(listener)
      } as unknown as MediaQueryList
    }) as typeof window.matchMedia
    return queries
  }

  const setRatio = (value: number) =>
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value })

  it('notifies on a ratio change and re-arms for the new ratio', () => {
    const queries = stubMatchMedia()
    setRatio(1)
    const onChange = vi.fn()

    const stop = watchDevicePixelRatio(onChange)
    expect(queries.map((entry) => entry.query)).toEqual(['(resolution: 1dppx)'])

    setRatio(2)
    for (const listener of [...queries[0].listeners]) listener()

    expect(onChange).toHaveBeenCalledOnce()
    expect(queries.map((entry) => entry.query)).toEqual([
      '(resolution: 1dppx)',
      '(resolution: 2dppx)'
    ])

    stop()
    expect(queries[1].listeners.size).toBe(0)
  })

  it('is a no-op without matchMedia', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia

    expect(() => watchDevicePixelRatio(vi.fn())()).not.toThrow()
  })
})
