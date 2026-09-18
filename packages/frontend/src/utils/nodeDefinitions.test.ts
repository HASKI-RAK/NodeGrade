import {
  CATEGORY_COLORS,
  getDefinedNodeConstructors,
  getNodeDefinition,
  getNodeDefinitions,
  LINK_TYPE_COLORS,
  LINK_TYPE_SHAPES,
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

  it('color-codes every port by type with a matching shape', () => {
    for (const Node of getDefinedNodeConstructors()) {
      const node = new Node()
      for (const slot of [...(node.inputs ?? []), ...(node.outputs ?? [])]) {
        const color = LINK_TYPE_COLORS[slot.type as keyof typeof LINK_TYPE_COLORS]
        expect(slot.color_on).toBe(color)
        expect(slot.color_off).toBe(color)
        expect(slot.shape).toBe(
          LINK_TYPE_SHAPES[slot.type as keyof typeof LINK_TYPE_SHAPES]
        )
      }
    }
  })

  it('restyles legacy ports on configure and keeps titles readable', () => {
    const node = LiteGraph.createNode('basic/prompt-message')
    node.inputs?.forEach((slot) => {
      slot.color_off = '#00FF0060'
      slot.shape = undefined
    })
    node.configure({ ...node.serialize(), inputs: node.inputs, outputs: node.outputs })
    expect(node.inputs?.[0].color_on).toBe(LINK_TYPE_COLORS.string)
    expect(node.inputs?.[0].color_off).toBe(LINK_TYPE_COLORS.string)
    expect(node.outputs?.[0].color_on).toBe(LINK_TYPE_COLORS.message)

    // Titles stay near-white on the dark bar; the category signal is the pill
    // plus the status dot, never a full-bleed tint.
    expect(LiteGraph.NODE_TITLE_COLOR).toBe('#F5F7FA')
    for (const Node of getDefinedNodeConstructors()) {
      const category = Node.definition.category
      expect(Reflect.get(Node, 'title_text_color')).toBe('#F5F7FA')
      expect(Reflect.get(Node, 'boxcolor')).toBe(CATEGORY_COLORS[category])
      expect(Reflect.get(Node, 'color')).toBeUndefined()
    }
  })
})
