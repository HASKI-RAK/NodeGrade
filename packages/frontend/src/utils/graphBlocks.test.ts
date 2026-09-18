import { LGraph, LiteGraph, type BlockInterfaces } from '@haski/ta-lib'
import type { LGraphCanvas, LGraphNode } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import { insertBlock, parseBlockGraph } from './graphBlocks'

const content = JSON.stringify({
  last_node_id: 2,
  last_link_id: 0,
  nodes: [
    {
      id: 1,
      type: 'basic/watch',
      pos: [300, 100],
      size: [180, 60],
      inputs: [{ name: 'value', type: 'string', link: null }],
      outputs: []
    },
    {
      id: 2,
      type: 'basic/string',
      pos: [300, 240],
      size: [180, 60],
      inputs: [],
      outputs: [{ name: 'value', type: 'string', links: null }],
      properties: { value: 'feedback' }
    }
  ],
  links: [],
  groups: [],
  config: {},
  extra: {},
  version: 0.4
})

const interfaces: BlockInterfaces = {
  boundary: [
    {
      key: 'text',
      label: 'Text to review',
      dataType: 'string',
      direction: 'input',
      internalNodeId: 1,
      internalSlot: 0,
      required: true
    },
    {
      key: 'feedback',
      label: 'Feedback text',
      dataType: 'string',
      direction: 'output',
      internalNodeId: 2,
      internalSlot: 0
    }
  ]
}

const provenance = {
  templateId: 'template-1',
  templateRevision: 3,
  templateName: 'Feedback generator',
  insertedAt: '2026-09-18T10:00:00.000Z'
}

const canvas = () =>
  ({
    canvas: { width: 800, height: 600 },
    convertCanvasToOffset: vi.fn((point: [number, number]) => point),
    selectNodes: vi.fn()
  }) as unknown as LGraphCanvas

describe('block graph parsing', () => {
  it('accepts serialized LiteGraph block', () => {
    expect(
      parseBlockGraph(
        JSON.stringify({
          nodes: [{ id: 7, type: 'basic/number', pos: [10, 20] }],
          links: []
        })
      ).nodes[0].id
    ).toBe(7)
  })

  it('rejects malformed content', () => {
    expect(() => parseBlockGraph('{"nodes":[{"type":"basic/number"}]}')).toThrow(
      'invalid graph content'
    )
  })
})

describe('subgraph block insertion', () => {
  it('creates one wrapper with boundary adapters and provenance', () => {
    const graph = new LGraph()
    const targetCanvas = canvas()
    const result = insertBlock({
      graph,
      canvas: targetCanvas,
      content,
      requiredNodeTypes: ['basic/watch', 'basic/string'],
      interfaces,
      provenance
    })

    expect(result.nodes).toHaveLength(1)
    const wrapper = result.nodes[0] as LGraphNode & { subgraph: LGraph }
    expect(wrapper.type).toBe('graph/subgraph')
    expect(wrapper.title).toBe('Feedback generator')
    expect(wrapper.inputs?.map(({ name }) => name)).toEqual(['Text to review'])
    expect(wrapper.outputs?.map(({ name }) => name)).toEqual(['Feedback text'])
    expect(wrapper.properties.templateBlock).toEqual(provenance)
    expect(wrapper.subgraph.serialize().nodes.map(({ type }) => type)).toEqual([
      'basic/watch',
      'basic/string',
      'graph/input',
      'graph/output'
    ])
    expect(wrapper.subgraph.serialize().links).toHaveLength(2)
    expect(targetCanvas.selectNodes).toHaveBeenCalledWith([wrapper])
  })

  it('keeps repeated wrapper ids unique and suggests wrapper ports', () => {
    const graph = new LGraph()
    const source = LiteGraph.createNode('basic/string')
    const sink = LiteGraph.createNode('basic/watch')
    if (!source || !sink) throw new Error('Test node types are unavailable.')
    graph.add(source)
    graph.add(sink)

    const first = insertBlock({
      graph,
      canvas: canvas(),
      content,
      requiredNodeTypes: ['basic/watch', 'basic/string'],
      interfaces,
      provenance
    })
    const second = insertBlock({
      graph,
      canvas: canvas(),
      content,
      requiredNodeTypes: ['basic/watch', 'basic/string'],
      interfaces,
      provenance
    })

    expect(first.nodes[0].id).not.toBe(second.nodes[0].id)
    expect(first.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'input',
          nodeId: first.nodes[0].id,
          slot: 0,
          name: 'Text to review'
        }),
        expect.objectContaining({
          direction: 'output',
          nodeId: first.nodes[0].id,
          slot: 0,
          name: 'Feedback text'
        })
      ])
    )
  })

  it('rejects a boundary pointing outside the copied graph', () => {
    expect(() =>
      insertBlock({
        graph: new LGraph(),
        canvas: canvas(),
        content,
        requiredNodeTypes: ['basic/watch', 'basic/string'],
        interfaces: {
          boundary: [{ ...interfaces.boundary[0], internalNodeId: 99 }]
        },
        provenance
      })
    ).toThrow('references node 99')
  })
})
