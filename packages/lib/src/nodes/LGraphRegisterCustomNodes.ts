/* eslint-disable immutable/no-mutation */
import { LGraphCanvas, LiteGraph } from './litegraph-extensions'
import { CANVAS_THEME, CATEGORY_COLORS, LINK_TYPE_COLORS } from './litegraph-extensions/LGraphNode'
import { getDefinedNodeConstructors } from './NodeDefinitionRegistry'

export function LGraphRegisterCustomNodes() {
  // LiteGraph.clearRegisteredTypes() // Uncomment this line to clear all registered types during debugging or development.
  for (const Node of getDefinedNodeConstructors()) {
    LiteGraph.registerNodeType(Node.getPath(), Node)
    // Readable titles: keep the bar dark with near-white text. The category
    // lives in the pill plus the dot (`boxcolor`), never as a full-bleed
    // tint — saturated fills kill gray title text.
    const category = Node.definition?.category
    if (category && CATEGORY_COLORS[category]) {
      Reflect.set(Node, 'title_text_color', '#F5F7FA')
      Reflect.set(Node, 'boxcolor', CATEGORY_COLORS[category])
    }
    // Per-node round shape: NODE_DEFAULT_SHAPE is a string key LiteGraph never
    // resolves per node, and drawNode falls back to BOX_SHAPE when `_shape`
    // is unset — which would route the title box through the square branch
    // and skip the pill hook. Assigning the prototype property runs through
    // LiteGraph's shape setter and selects ROUND_SHAPE properly.
    Node.prototype.shape = 'round'
  }

  // Styling: dark elevated nodes, flat matte wires (no glow/shadow). Node
  // fills come from CANVAS_THEME so they stay in step with the canvas
  // background applied per instance by `applyCanvasTheme`.
  LiteGraph.NODE_TITLE_COLOR = '#F5F7FA'
  LiteGraph.NODE_TEXT_COLOR = '#C6CBD6'
  LiteGraph.NODE_DEFAULT_BGCOLOR = CANVAS_THEME.nodeBody
  LiteGraph.NODE_DEFAULT_COLOR = CANVAS_THEME.nodeTitle
  LiteGraph.NODE_DEFAULT_SHAPE = 'round'
  LiteGraph.LINK_COLOR = '#8A8FA0'
  LiteGraph.EVENT_LINK_COLOR = '#8A8FA0'
  LiteGraph.CONNECTING_LINK_COLOR = '#E2E8F0'
  // Wires take the source-port color once connected; the per-type fallback
  // keeps untyped links neutral instead of default green.
  LGraphCanvas.link_type_colors = {
    ...LGraphCanvas.link_type_colors,
    ...LINK_TYPE_COLORS
  }

  const graphInstance = LiteGraph // Create a new variable from LiteGraph
  return graphInstance // Return the new variable
}

export default LGraphRegisterCustomNodes
