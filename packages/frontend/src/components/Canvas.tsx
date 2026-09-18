import { applyCanvasTheme, LGraph } from '@haski/ta-lib'
import { LGraphCanvas, type LGraphNode } from 'litegraph.js'
import { useEffect, useRef } from 'react'

import { installDebugBridge } from '@/utils/debugBridge'

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

  useEffect(() => {
    console.log('Canvas mounted or lgraph updated')

    if (canvasRef.current) {
      if (!lcanvas.current) {
        // Initialize canvas if it doesn't exist
        lcanvas.current = new LGraphCanvas(canvasRef.current, props.lgraph)
        lcanvas.current.allow_interaction = !props.readOnly
        lcanvas.current.allow_dragnodes = !props.readOnly
        lcanvas.current.allow_reconnect_links = !props.readOnly
        // Flat matte wires: no glow or shadow on connections.
        lcanvas.current.render_connections_shadows = false
        lcanvas.current.render_shadows = false
        lcanvas.current.connections_width = 3
        // Dark blue-gray canvas + grid tile that the node fills are tuned
        // against (see CANVAS_THEME); LiteGraph's stock #222 barely separates
        // from the node bodies.
        applyCanvasTheme(lcanvas.current)
        installDebugBridge(props.lgraph, lcanvas.current)
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
      props.lgraph.setDirtyCanvas(true, true)
    })
    observer.observe(canvas.parentElement ?? canvas)
    return () => observer.disconnect()
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
          border: '1px solid #d8dce6'
        }}
      />
    </div>
  )
}

export default Canvas
