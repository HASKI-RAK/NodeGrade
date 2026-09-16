import { compactNodeWidgets, LiteGraph, loadLegacyWidgetProperties } from '@haski/ta-lib'
import type { LGraph, LGraphCanvas, LGraphNode, SerializedLGraphNode } from 'litegraph.js'

import type { TemplateInterfaces } from '@/api/http'

type BlockNode = Omit<SerializedLGraphNode, 'id' | 'type' | 'pos'> & {
  id: number
  type: string
  pos: [number, number]
}
type BlockLink = [number, number, number, number, number, string]
type BlockGraph = { nodes: BlockNode[]; links?: BlockLink[] }

export type ConnectionSuggestion = {
  direction: 'input' | 'output'
  nodeId: number
  slot: number
  existingNodeId: number
  existingSlot: number
  name: string
  type: string
}

const isBlockGraph = (value: unknown): value is BlockGraph => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('nodes' in value) ||
    !Array.isArray(value.nodes)
  )
    return false
  return value.nodes.every(
    (node) =>
      typeof node === 'object' &&
      node !== null &&
      'id' in node &&
      typeof node.id === 'number' &&
      'type' in node &&
      typeof node.type === 'string' &&
      'pos' in node &&
      Array.isArray(node.pos)
  )
}

export const parseBlockGraph = (content: string): BlockGraph => {
  const parsed: unknown = JSON.parse(content)
  if (!isBlockGraph(parsed))
    throw new Error('Block template contains invalid graph content.')
  return parsed
}

export const insertBlock = ({
  graph,
  canvas,
  content,
  requiredNodeTypes,
  interfaces
}: {
  graph: LGraph
  canvas: LGraphCanvas
  content: string
  requiredNodeTypes: string[]
  interfaces: TemplateInterfaces | null
}): { nodes: LGraphNode[]; suggestions: ConnectionSuggestion[] } => {
  const missing = requiredNodeTypes.filter(
    (type) => !LiteGraph.registered_node_types[type]
  )
  if (missing.length)
    throw new Error(`Block requires unavailable node types: ${missing.join(', ')}`)
  const block = parseBlockGraph(content)
  if (!block.nodes.length) return { nodes: [], suggestions: [] }
  const existingNodes = graph.serialize().nodes.flatMap(({ id }) => {
    const node = graph.getNodeById(id)
    return node ? [node] : []
  })

  const left = Math.min(...block.nodes.map((node) => node.pos[0]))
  const top = Math.min(...block.nodes.map((node) => node.pos[1]))
  const right = Math.max(
    ...block.nodes.map((node) => node.pos[0] + (node.size?.[0] ?? 160))
  )
  const bottom = Math.max(
    ...block.nodes.map((node) => node.pos[1] + (node.size?.[1] ?? 80))
  )
  const center = canvas.convertCanvasToOffset([
    canvas.canvas.width / 2,
    canvas.canvas.height / 2
  ])
  const delta: [number, number] = [
    center[0] - (left + right) / 2,
    center[1] - (top + bottom) / 2
  ]
  const byOldId = new Map<number, LGraphNode>()

  block.nodes.forEach((serialized) => {
    const node = LiteGraph.createNode(serialized.type)
    if (!node) throw new Error(`Could not create node type ${serialized.type}.`)
    const position: [number, number] = [
      serialized.pos[0] + delta[0],
      serialized.pos[1] + delta[1]
    ]
    const clean: SerializedLGraphNode = {
      ...serialized,
      id: -1,
      pos: position,
      inputs: serialized.inputs?.map((input) => ({ ...input, link: null })),
      outputs: serialized.outputs?.map((output) => ({ ...output, links: [] }))
    }
    node.configure(clean)
    loadLegacyWidgetProperties(node, clean)
    compactNodeWidgets(node)
    graph.add(node)
    byOldId.set(serialized.id, node)
  })

  block.links?.forEach(([, sourceId, sourceSlot, targetId, targetSlot]) => {
    const source = byOldId.get(sourceId)
    const target = byOldId.get(targetId)
    if (source && target) source.connect(sourceSlot, target, targetSlot)
  })

  const compatible = (first: string | -1, second: string) =>
    first === '*' || second === '*' || first === second
  const mapPorts = (direction: 'input' | 'output'): ConnectionSuggestion[] =>
    (interfaces?.[`${direction}s`] ?? []).flatMap((port) => {
      const node = byOldId.get(port.nodeId)
      if (!node) return []
      return existingNodes.flatMap((existing) => {
        const slots =
          direction === 'input' ? (existing.outputs ?? []) : (existing.inputs ?? [])
        return slots.flatMap((slot, existingSlot) =>
          compatible(slot.type, port.type)
            ? [
                {
                  direction,
                  nodeId: node.id,
                  slot: port.slot,
                  existingNodeId: existing.id,
                  existingSlot,
                  name: port.name,
                  type: port.type
                }
              ]
            : []
        )
      })
    })
  const nodes = [...byOldId.values()]
  canvas.selectNodes(nodes)
  graph.setDirtyCanvas(true, true)
  return { nodes, suggestions: [...mapPorts('input'), ...mapPorts('output')] }
}
