import {
  type BlockBoundaryPort,
  compactNodeWidgets,
  LiteGraph,
  loadLegacyWidgetProperties,
  type TemplateBlockProvenance
} from '@haski/ta-lib'
import type { LGraph, LGraphCanvas, LGraphNode, SerializedLGraphNode } from 'litegraph.js'

import type { TemplateInterfaces } from '@/api/http'
import { canvasViewportCenter } from '@/utils/canvasPixelRatio'

type BlockNode = Omit<SerializedLGraphNode, 'id' | 'type' | 'pos'> & {
  id: number
  type: string
  pos: [number, number]
}
type BlockLink = [number, number, number, number, number, string]
type BlockGraph = { nodes: BlockNode[]; links?: BlockLink[] }
type SubgraphNode = LGraphNode & { subgraph: LGraph }

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

const validateBoundary = (block: BlockGraph, boundary: BlockBoundaryPort[]) => {
  const nodes = new Map(block.nodes.map((node) => [node.id, node]))
  const keys = new Set<string>()
  for (const port of boundary) {
    if (keys.has(port.key))
      throw new Error(`Block boundary key ${port.key} is duplicated.`)
    keys.add(port.key)
    const node = nodes.get(port.internalNodeId)
    if (!node)
      throw new Error(
        `Block boundary ${port.label} references node ${port.internalNodeId}, which is missing.`
      )
    const slots = port.direction === 'input' ? node.inputs : node.outputs
    if (!slots?.[port.internalSlot])
      throw new Error(
        `Block boundary ${port.label} references missing ${port.direction} slot ${port.internalSlot}.`
      )
  }
}

const createInnerNode = (serialized: BlockNode): LGraphNode => {
  const node = LiteGraph.createNode(serialized.type)
  if (!node) throw new Error(`Could not create node type ${serialized.type}.`)
  const clean: SerializedLGraphNode = {
    ...serialized,
    id: -1,
    inputs: serialized.inputs?.map((input) => ({ ...input, link: null })),
    outputs: serialized.outputs?.map((output) => ({ ...output, links: [] }))
  }
  node.configure(clean)
  loadLegacyWidgetProperties(node, clean)
  compactNodeWidgets(node)
  return node
}

const createBoundaryAdapter = (
  wrapper: SubgraphNode,
  port: BlockBoundaryPort,
  target: LGraphNode
) => {
  const type = port.direction === 'input' ? 'graph/input' : 'graph/output'
  const adapter = LiteGraph.createNode(type)
  if (!adapter) throw new Error(`Could not create node type ${type}.`)
  wrapper.subgraph.add(adapter)
  adapter.setProperty('name', port.label)
  adapter.setProperty('type', port.dataType)
  adapter.pos =
    port.direction === 'input'
      ? [target.pos[0] - 260, target.pos[1]]
      : [target.pos[0] + (target.size?.[0] ?? 160) + 80, target.pos[1]]
  if (port.direction === 'input') adapter.connect(0, target, port.internalSlot)
  else target.connect(port.internalSlot, adapter, 0)
}

export const insertBlock = ({
  graph,
  canvas,
  content,
  requiredNodeTypes,
  interfaces,
  provenance,
  description
}: {
  graph: LGraph
  canvas: LGraphCanvas
  content: string
  requiredNodeTypes: string[]
  interfaces: TemplateInterfaces | null
  provenance: TemplateBlockProvenance
  description?: string | null
}): { nodes: LGraphNode[]; suggestions: ConnectionSuggestion[] } => {
  const missing = requiredNodeTypes.filter(
    (type) => !LiteGraph.registered_node_types[type]
  )
  if (missing.length)
    throw new Error(`Block requires unavailable node types: ${missing.join(', ')}`)
  if (!interfaces?.boundary.length) throw new Error('Block template has no boundary.')

  const block = parseBlockGraph(content)
  if (!block.nodes.length) throw new Error('Block template has no internal nodes.')
  validateBoundary(block, interfaces.boundary)

  const existingNodes = graph.serialize().nodes.flatMap(({ id }) => {
    const node = graph.getNodeById(id)
    return node ? [node] : []
  })
  const wrapper = LiteGraph.createNode('graph/subgraph') as SubgraphNode | null
  if (!wrapper) throw new Error('Could not create Subgraph wrapper.')
  wrapper.title = provenance.templateName
  wrapper.properties.templateBlock = { ...provenance }
  wrapper.properties.templateDescription = description ?? ''
  wrapper.properties.templateBoundary = interfaces.boundary.map((port) => ({ ...port }))

  const byOldId = new Map<number, LGraphNode>()
  block.nodes.forEach((serialized) => {
    const node = createInnerNode(serialized)
    wrapper.subgraph.add(node)
    byOldId.set(serialized.id, node)
  })
  block.links?.forEach(([, sourceId, sourceSlot, targetId, targetSlot]) => {
    const source = byOldId.get(sourceId)
    const target = byOldId.get(targetId)
    if (source && target) source.connect(sourceSlot, target, targetSlot)
  })
  interfaces.boundary.forEach((port) => {
    const target = byOldId.get(port.internalNodeId)
    if (target) createBoundaryAdapter(wrapper, port, target)
  })

  const longestLabel = Math.max(...interfaces.boundary.map((port) => port.label.length))
  wrapper.size = [Math.max(300, longestLabel * 8 + 140), 100]
  const center = canvasViewportCenter(canvas)
  wrapper.pos = [center[0] - wrapper.size[0] / 2, center[1] - wrapper.size[1] / 2]
  graph.add(wrapper)

  const compatible = (first: string | -1, second: string) =>
    first === '*' || second === '*' || first === second
  const suggestions = interfaces.boundary.flatMap((port) => {
    const wrapperPorts = interfaces.boundary.filter(
      (candidate) => candidate.direction === port.direction
    )
    const slot = wrapperPorts.findIndex((candidate) => candidate.key === port.key)
    return existingNodes.flatMap((existing) => {
      const slots =
        port.direction === 'input' ? (existing.outputs ?? []) : (existing.inputs ?? [])
      return slots.flatMap((candidate, existingSlot) =>
        compatible(candidate.type, port.dataType)
          ? [
              {
                direction: port.direction,
                nodeId: wrapper.id,
                slot,
                existingNodeId: existing.id,
                existingSlot,
                name: port.label,
                type: port.dataType
              }
            ]
          : []
      )
    })
  })

  canvas.selectNodes([wrapper])
  graph.setDirtyCanvas(true, true)
  return { nodes: [wrapper], suggestions }
}
