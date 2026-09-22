import { applyCanvasTheme, LGraph } from '@haski/ta-lib'
import { useTheme } from '@mui/material'
import { LGraphCanvas, type LGraphNode } from 'litegraph.js'
import { useEffect, useRef } from 'react'

import {
  installCanvasPixelRatio,
  refreshCanvasPixelRatio,
  watchDevicePixelRatio
} from '@/utils/canvasPixelRatio'
import { installDebugBridge } from '@/utils/debugBridge'
import { installGroupTitleDrag } from '@/utils/groupTitleDrag'
import { installGroupTitleStyle } from '@/utils/groupTitleStyle'
import { installMixedInputGlyph } from '@/utils/mixedInputGlyph'
import { installNodeConnectionHighlight } from '@/utils/nodeConnectionHighlight'
import { hideStockSubgraphChrome } from '@/utils/subgraphChrome'

type CanvasProps = {
  lgraph: LGraph
  readOnly?: boolean
  developerTools?: boolean
  onReady?: (canvas: LGraphCanvas) => void
  onSelectionChange?: (nodes: LGraphNode[]) => void
  onOpenSubgraph?: (node: LGraphNode) => void
}

const Canvas = (props: CanvasProps) => {
  const lcanvas = useRef<LGraphCanvas | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const theme = useTheme()

  useEffect(() => {
    console.log('Canvas mounted or lgraph updated')

    if (canvasRef.current) {
      if (!lcanvas.current) {
        // Initialize canvas if it doesn't exist
        const canvas = new LGraphCanvas(canvasRef.current, props.lgraph)
        lcanvas.current = canvas
        canvas.allow_interaction = !props.readOnly
        canvas.allow_dragnodes = !props.readOnly
        canvas.allow_reconnect_links = !props.readOnly
        // Flat matte wires: no glow or shadow on connections.
        canvas.render_connections_shadows = false
        canvas.render_shadows = false
        canvas.connections_width = 3
        // Bitmap at device resolution; LiteGraph alone sizes it in CSS pixels
        // and everything it draws comes out soft on scaled displays. The grid
        // is a raster tile, so it is rebuilt whenever the ratio changes.
        installCanvasPixelRatio(canvas, {
          onRatioChange: (pixelRatio) => applyCanvasTheme(canvas, { pixelRatio })
        })
        installGroupTitleDrag(canvas)
        installGroupTitleStyle(canvas)
        installMixedInputGlyph(canvas)
        installNodeConnectionHighlight(canvas)
        // The breadcrumb above the canvas owns block navigation; LiteGraph's
        // own banner and Graph Inputs/Outputs panels would duplicate it.
        hideStockSubgraphChrome(canvas)
        // Dark blue-gray canvas + grid tile that the node fills are tuned
        // against (see CANVAS_THEME); LiteGraph's stock #222 barely separates
        // from the node bodies.
        applyCanvasTheme(canvas)
        installDebugBridge(props.lgraph, canvas)
      } else {
        // Update the graph reference if canvas already exists
        lcanvas.current.setGraph(props.lgraph)
      }

      lcanvas.current.allow_searchbox = !!props.developerTools
      lcanvas.current.onSelectionChange = (nodes) =>
        props.onSelectionChange?.(Object.values(nodes))
      // Suppress the legacy LiteGraph node panel for template blocks. The React
      // inspector owns the Open block action, so the native panel would only
      // duplicate the drill-down affordance.
      lcanvas.current.onShowNodePanel = (node) => {
        if (node.type === 'graph/subgraph') props.onOpenSubgraph?.(node)
      }
      lcanvas.current.onNodeDblClicked = (node) => {
        if (node.type === 'graph/subgraph') props.onOpenSubgraph?.(node)
      }
      props.onReady?.(lcanvas.current)
      props.lgraph.setDirtyCanvas(true, true)
    }

    return () => {
      // Only stop the graph when component unmounts
      if (lcanvas.current && canvasRef.current === null) {
        props.lgraph.stop()
      }
    }
  }, [
    props.developerTools,
    props.lgraph,
    props.onReady,
    props.onOpenSubgraph,
    props.onSelectionChange,
    props.readOnly
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || !lcanvas.current) return
      const { width, height } = entry.contentRect
      lcanvas.current.resize(width, height)
      // Resizing clears both canvas bitmaps. Paint them synchronously so a
      // panel drag cannot present the cleared frame before LiteGraph's loop.
      lcanvas.current.draw(true, true)
    })
    observer.observe(canvas.parentElement ?? canvas)
    // Monitor switch or browser zoom: same CSS box, different device pixels.
    const stopWatchingRatio = watchDevicePixelRatio(() => {
      if (!lcanvas.current) return
      refreshCanvasPixelRatio(lcanvas.current)
      props.lgraph.setDirtyCanvas(true, true)
    })
    return () => {
      observer.disconnect()
      stopWatchingRatio()
    }
  }, [props.lgraph])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || props.developerTools) return
    const stopContextMenu = (event: MouseEvent) => event.preventDefault()
    canvas.addEventListener('contextmenu', stopContextMenu, { capture: true })
    return () =>
      canvas.removeEventListener('contextmenu', stopContextMenu, { capture: true })
  }, [props.developerTools])

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 360, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        id="mycanvas"
        aria-label="Workflow canvas"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: `1px solid ${theme.palette.divider}`
        }}
      />
    </div>
  )
}

export default Canvas
