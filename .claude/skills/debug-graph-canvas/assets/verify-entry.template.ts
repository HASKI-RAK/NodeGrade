import { LGraph, LGraphCanvas, LiteGraph } from 'litegraph.js'
import {
  CATEGORY_COLORS,
  LGraphRegisterCustomNodes,
  LINK_TYPE_COLORS
} from '@haski/ta-lib'

LGraphRegisterCustomNodes()

const legend = document.getElementById('legend')
if (legend)
  for (const [type, color] of Object.entries(LINK_TYPE_COLORS)) {
    const chip = document.createElement('span')
    chip.className = 'chip'
    chip.innerHTML = `<span class="dot" style="background:${color}"></span>${type} ${color}`
    legend.appendChild(chip)
  }

const canvasEl = document.getElementById('c') as HTMLCanvasElement
const graph = new LGraph()
const canvas = new LGraphCanvas(canvasEl, graph)
canvas.resize(1100, 640)
canvas.ds.scale = 1
canvas.ds.offset = [0, 0]
canvas.render_connections_shadows = false
canvas.render_shadows = false
canvas.connections_width = 3
canvas.pause_rendering = false
canvas.live_mode = false

// Disable culling for the verify page: paint every node every frame so the
// screenshot shows all titles and pills, not just the dirty region. The
// canvas calls computeVisibleNodes(null, this.visible_nodes), so patch the
// prototype before the first draw.
LGraphCanvas.prototype.computeVisibleNodes = function (
  this: unknown,
  nodes2: unknown,
  out: unknown
) {
  const list = (nodes2 ?? graph._nodes) as unknown[]
  const target = (out ?? []) as unknown[]
  target.length = 0
  for (const node of list) target.push(node)
  return target as never
}

// Instrument: count title-hook invocations per frame to prove the hook fires.
let titleHookCalls = 0
let titleBoxCalls = 0
const proto = Object.getPrototypeOf(LiteGraph.createNode('basic/prompt-message'))
const baseHook = proto.onDrawTitleText as (...args: unknown[]) => void
if (typeof baseHook === 'function')
  proto.onDrawTitleText = function (this: unknown, ...args: unknown[]) {
    titleHookCalls += 1
    return baseHook.apply(this, args as [])
  }
const baseBox = proto.onDrawTitleBox as (...args: unknown[]) => void
if (typeof baseBox === 'function')
  proto.onDrawTitleBox = function (this: unknown, ...args: unknown[]) {
    titleBoxCalls += 1
    return baseBox.apply(this, args as [])
  }

const specs: Array<[string, number, number]> = [
  ['input/question', 20, 20],
  ['basic/prompt-message', 20, 220],
  ['utils/concat-object', 300, 200],
  ['models/llm', 580, 40],
  ['utils/concat-string', 20, 420],
  ['models/cosine-similarity', 300, 420],
  ['models/sentence-transformer', 580, 300]
]
const nodes = []
for (const [type, x, y] of specs) {
  const node = LiteGraph.createNode(type)
  if (!node) continue
  node.pos = [x, y]
  graph.add(node)
  nodes.push(node)
}
// Mirror the production graph: question -> prompt -> concat-object -> llm,
// concat-string -> prompt, sentence-transformer -> cosine-similarity.
nodes[0]?.connect(0, nodes[1], 0)
nodes[1]?.connect(0, nodes[2], 0)
nodes[2]?.connect(0, nodes[3], 0)
nodes[4]?.connect(0, nodes[1], 0)
nodes[6]?.connect(0, nodes[5], 0)
graph.setDirtyCanvas(true, true)
canvas.draw(true, true)
// Keep repainting until every node painted at least once, then freeze the
// loop so the screenshot is deterministic.
const need = nodes.length
const stopLoop = () => {
  canvas.draw(true, true)
  if (titleHookCalls >= need) canvas.stopRendering()
  else requestAnimationFrame(stopLoop)
}
requestAnimationFrame(stopLoop)

// Expose for the screenshot assertion: title colors + pill categories.
;(window as { __nodeStyle?: unknown }).__nodeStyle = {
  titleColor: LiteGraph.NODE_TITLE_COLOR,
  protoHook: typeof Object.getPrototypeOf(nodes[0] ?? {}).onDrawTitleText,
  ownHook: nodes.map((node) => typeof node.onDrawTitleText),
  titleHookCalls: () => titleHookCalls,
  titleBoxCalls: () => titleBoxCalls,
  nodes: nodes.map((node) => ({
    type: node.type,
    title: node.getTitle(),
    ctorColor: (node.constructor as { color?: string }).color,
    titleTextColor: (node.constructor as { title_text_color?: string })
      .title_text_color,
    boxcolor: node.boxcolor,
    category: (node.constructor as { definition?: { category?: string } })
      .definition?.category,
    categoryFill:
      CATEGORY_COLORS[
        (node.constructor as { definition?: { category?: keyof typeof CATEGORY_COLORS } })
          .definition?.category as keyof typeof CATEGORY_COLORS
      ]
  }))
}
