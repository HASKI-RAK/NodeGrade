/**
 * Selective graph persistence types
 * Contains only essential data for graph functionality: nodes, links, and properties
 */

export interface SelectiveNodeData {
  id: number
  type: string | number
  pos: [number, number]
  size?: [number, number]
  properties: Record<string, any>
  title?: string
  mode?: number
  flags?: Record<string, any>
  inputs?: Array<{
    name: string
    type: string
    link: number | null
  }>
  outputs?: Array<{
    name: string
    type: string
    links: number[]
    slot_index?: number
  }>
  order?: number
  color?: string
}

export interface SelectiveLinkData {
  id: number
  origin_id: number
  origin_slot: number
  target_id: number
  target_slot: number
  type?: string | number
}

export interface SelectiveGraphData {
  nodes: SelectiveNodeData[]
  links: SelectiveLinkData[]
  groups?: {
    title: string
    bounding: [number, number, number, number]
    color?: string
  }[]
  version?: number
}

/**
 * Utilities for converting between full graph serialization and selective data
 */
export class GraphSerializer {
  /**
   * Converts a full serialized graph to selective data
   */
  static toSelectiveData(fullGraph: any): SelectiveGraphData {
    const selectiveNodes: SelectiveNodeData[] =
      fullGraph.nodes?.map((node: any) => ({
        id: node.id,
        type: node.type,
        pos: node.pos,
        size: node.size,
        properties: node.properties || {},
        title: node.title,
        mode: node.mode,
        flags: node.flags,
        inputs: node.inputs,
        outputs: node.outputs,
        order: node.order,
        color: node.color
      })) || []

    const selectiveLinks: SelectiveLinkData[] =
      fullGraph.links?.map((link: any) => ({
        id: link[0],
        origin_id: link[1],
        origin_slot: link[2],
        target_id: link[3],
        target_slot: link[4],
        type: link[5]
      })) || []

    return {
      nodes: selectiveNodes,
      links: selectiveLinks,
      groups: fullGraph.groups,
      version: fullGraph.version
    }
  }

  /**
   * Converts selective data back to a format that can be used by LGraph.configure()
   */
  static fromSelectiveData(selectiveData: SelectiveGraphData): any {
    const fullNodes = selectiveData.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      pos: node.pos,
      size: node.size || [200, 100],
      flags: node.flags || {},
      order: 0,
      mode: node.mode || 0,
      inputs: [], // Will be reconstructed by the node type
      outputs: [], // Will be reconstructed by the node type
      properties: node.properties,
      title: node.title
    }))

    const fullLinks = selectiveData.links.map((link) => [
      link.id,
      link.origin_id,
      link.origin_slot,
      link.target_id,
      link.target_slot,
      link.type
    ])

    return {
      last_node_id: Math.max(0, ...selectiveData.nodes.map((n) => n.id || 0)),
      last_link_id: Math.max(0, ...selectiveData.links.map((l) => l.id || 0)),
      nodes: fullNodes,
      links: fullLinks,
      groups: selectiveData.groups || [],
      config: {},
      version: selectiveData.version || 0.4
    }
  }
}
