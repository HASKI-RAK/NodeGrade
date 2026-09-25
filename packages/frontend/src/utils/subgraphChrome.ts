import type { LGraphCanvas } from 'litegraph.js'

type SubgraphChromeCanvas = LGraphCanvas & {
  _graph_stack?: unknown[] | null
  drawSubgraphPanel: (ctx: CanvasRenderingContext2D) => void
  __stockSubgraphChromeHidden?: boolean
}

/**
 * Hide the subgraph UI LiteGraph paints onto the canvas while `openSubgraph`
 * is active: the "Parent >> Child" banner on the background layer and the
 * "Graph Inputs" / "Graph Outputs" panels with their X and + buttons. The
 * editor's breadcrumb owns block navigation (`Editor.tsx`); those buttons
 * would close the subgraph behind the breadcrumb's back or open LiteGraph's
 * add-input dialog, which knows nothing about template block boundaries.
 *
 * The banner has no hook of its own: `drawBackCanvas` paints it whenever
 * `_graph_stack` is non-empty, so the stack is hidden from that one call and
 * restored right after. Nothing else in the back pass reads it.
 */
export const hideStockSubgraphChrome = (canvas: LGraphCanvas): void => {
  const runtime = canvas as SubgraphChromeCanvas
  if (runtime.__stockSubgraphChromeHidden) return
  runtime.__stockSubgraphChromeHidden = true

  runtime.drawSubgraphPanel = () => {}

  const drawBackCanvas = runtime.drawBackCanvas.bind(runtime)
  runtime.drawBackCanvas = () => {
    const stack = runtime._graph_stack
    runtime._graph_stack = []
    try {
      drawBackCanvas()
    } finally {
      runtime._graph_stack = stack
    }
  }
}
