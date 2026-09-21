import { type LGraphCanvas, type LGraphNode, LiteGraph } from 'litegraph.js'

export const NODE_CONNECTION_HIGHLIGHT_COLOR = '#7DD3FC'
export const NODE_CONNECTION_HIGHLIGHT_WIDTH = 5

type RuntimeLink = {
  id: number
}

type DrawNodeShape = (
  node: LGraphNode,
  context: CanvasRenderingContext2D,
  size: [number, number],
  foregroundColor: string,
  backgroundColor: string,
  selected: boolean,
  mouseOver: boolean
) => void

type RenderLink = (
  context: CanvasRenderingContext2D,
  start: [number, number],
  end: [number, number],
  link: RuntimeLink | null,
  skipBorder: boolean,
  flow: number,
  color?: string,
  startDirection?: number,
  endDirection?: number,
  sublines?: number
) => void

type HighlightCanvas = {
  graph?: { _nodes?: LGraphNode[] }
  highlighted_links: Record<number, boolean>
  connections_width: number
  dirty_bgcanvas: boolean
  drawFrontCanvas: () => void
  drawBackCanvas: () => void
  drawNodeShape: DrawNodeShape
  renderLink: RenderLink
  round_radius: number
  __nodeConnectionHighlightInstalled?: boolean
  __nodeConnectionHighlightSignature?: string
}

const connectedLinkIds = (nodes: LGraphNode[]): number[] => {
  const ids = new Set<number>()

  for (const node of nodes) {
    for (const input of node.inputs ?? []) {
      if (input.link != null) ids.add(input.link)
    }
    for (const output of node.outputs ?? []) {
      for (const linkId of output.links ?? []) ids.add(linkId)
    }
  }

  return [...ids].sort((a, b) => a - b)
}

/**
 * Emphasize the hovered or selected node together with every attached wire.
 * LiteGraph keeps links on its background canvas, so a changed highlight set
 * explicitly refreshes that layer before the foreground is painted.
 */
export const installNodeConnectionHighlight = (canvas: LGraphCanvas): void => {
  const runtimeCanvas = canvas as unknown as HighlightCanvas
  if (runtimeCanvas.__nodeConnectionHighlightInstalled) return
  runtimeCanvas.__nodeConnectionHighlightInstalled = true

  const drawFrontCanvas = runtimeCanvas.drawFrontCanvas.bind(runtimeCanvas)
  runtimeCanvas.drawFrontCanvas = () => {
    const activeNodes = (runtimeCanvas.graph?._nodes ?? []).filter(
      (node) => node.is_selected || node.mouseOver
    )
    const linkIds = connectedLinkIds(activeNodes)
    const signature = linkIds.join(',')

    if (signature !== runtimeCanvas.__nodeConnectionHighlightSignature) {
      runtimeCanvas.__nodeConnectionHighlightSignature = signature
      runtimeCanvas.highlighted_links = Object.fromEntries(
        linkIds.map((linkId) => [linkId, true])
      )
      runtimeCanvas.dirty_bgcanvas = true
      runtimeCanvas.drawBackCanvas()
    }

    drawFrontCanvas()
  }

  const drawNodeShape = runtimeCanvas.drawNodeShape.bind(runtimeCanvas)
  runtimeCanvas.drawNodeShape = (
    node,
    context,
    size,
    foregroundColor,
    backgroundColor,
    selected,
    mouseOver
  ) => {
    drawNodeShape(
      node,
      context,
      size,
      foregroundColor,
      backgroundColor,
      selected,
      mouseOver
    )
    if (!selected && !mouseOver) return

    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT
    context.save()
    context.globalAlpha = 1
    context.lineWidth = 3
    context.strokeStyle = NODE_CONNECTION_HIGHLIGHT_COLOR
    context.beginPath()
    context.roundRect(
      -4,
      -titleHeight - 4,
      size[0] + 9,
      size[1] + titleHeight + 9,
      runtimeCanvas.round_radius + 4
    )
    context.stroke()
    context.restore()
  }

  const renderLink = runtimeCanvas.renderLink.bind(runtimeCanvas)
  runtimeCanvas.renderLink = (
    context,
    start,
    end,
    link,
    skipBorder,
    flow,
    color,
    ...rest
  ) => {
    const highlighted = link != null && runtimeCanvas.highlighted_links[link.id]
    const width = runtimeCanvas.connections_width
    if (highlighted) runtimeCanvas.connections_width = NODE_CONNECTION_HIGHLIGHT_WIDTH

    renderLink(
      context,
      start,
      end,
      link,
      skipBorder,
      flow,
      highlighted ? NODE_CONNECTION_HIGHLIGHT_COLOR : color,
      ...rest
    )

    runtimeCanvas.connections_width = width
  }
}
