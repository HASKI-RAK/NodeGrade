#!/usr/bin/env node
// Headless port/category style dump. Fast pre-check before opening a browser:
// proves constructor colors, slot colors/shapes, and global title/background
// defaults without rendering anything.
const m = require('../../../../packages/lib/dist/index.js')
m.LGraphRegisterCustomNodes()
const { LiteGraph, LGraph } = m
const g = new LGraph()
for (const t of [
  'input/question',
  'basic/prompt-message',
  'utils/concat-object',
  'models/llm',
  'utils/concat-string',
  'models/cosine-similarity',
  'models/sentence-transformer'
]) {
  const n = LiteGraph.createNode(t)
  g.add(n)
  const ports = [...(n.inputs || []), ...(n.outputs || [])]
    .map((s) => `${s.name}:${s.type} on=${s.color_on} off=${s.color_off} shape=${s.shape}`)
    .join(' | ')
  console.log(`${t} :: ${ports}`)
  console.log(
    `  title_text_color=${n.constructor.title_text_color} boxcolor=${n.boxcolor} shape=${n.shape}/${n._shape} cat=${n.constructor.definition?.category}`
  )
}
console.log(
  `TITLE_COLOR=${LiteGraph.NODE_TITLE_COLOR} BG=${LiteGraph.NODE_DEFAULT_BGCOLOR} link.string=${LiteGraph.LGraphCanvas?.link_type_colors?.string}`
)
