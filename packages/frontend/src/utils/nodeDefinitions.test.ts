import {
  getDefinedNodeConstructors,
  getNodeDefinition,
  getNodeDefinitions,
  LiteGraph,
  loadLegacyWidgetProperties
} from '@haski/ta-lib'
import { describe, expect, it } from 'vitest'

describe('node definition registry', () => {
  it('provides valid unique metadata for every registered custom node', () => {
    const definitions = getNodeDefinitions()
    expect(new Set(definitions.map(({ type }) => type)).size).toBe(definitions.length)
    expect(definitions).toHaveLength(getDefinedNodeConstructors().length)

    getDefinedNodeConstructors().forEach((Node) => {
      expect(Node.definition).toBe(getNodeDefinition(Node.getPath()))
      expect(Node.definition.title).not.toBe('')
      expect(Node.definition.description).not.toBe('')
      const node = new Node()
      Node.definition.properties.forEach((property) => {
        expect(property.key in node.properties).toBe(true)
        if (property.keyValue) expect(property.advanced).toBe(false)
      })
    })
  })

  it('loads legacy widget values when serialized properties are missing', () => {
    const Node = getDefinedNodeConstructors().find(
      (candidate) => candidate.getPath() === 'basic/number'
    )
    expect(Node).toBeDefined()
    if (!Node) return
    const node = LiteGraph.createNode(Node.getPath())
    loadLegacyWidgetProperties(node, { widgets_values: [42], properties: {} })
    expect(node.properties.value).toBe(42)
  })

  it('maps legacy widget order independently from inspector property order', () => {
    const node = LiteGraph.createNode('models/llm')
    loadLegacyWidgetProperties(node, {
      widgets_values: [128, 0.25, 0.9, 40, 0, 1.1, 256, 1.5, 'test-model'],
      properties: {}
    })

    expect(node.properties.max_tokens).toBe(128)
    expect(node.properties.model).toBe('test-model')
  })

  it('restores the legacy prompt role inside its serialized value', () => {
    const node = LiteGraph.createNode('basic/prompt-message')
    loadLegacyWidgetProperties(node, {
      widgets_values: ['system'],
      properties: {}
    })

    expect(node.properties.value).toMatchObject({ role: 'system', content: '' })
  })

  it('applies legacy widget transformations during migration', () => {
    const node = LiteGraph.createNode('utils/string-array-to-string')
    loadLegacyWidgetProperties(node, {
      widgets_values: ['new line'],
      properties: {}
    })

    expect(node.properties.separator).toBe('\n')
  })
})
