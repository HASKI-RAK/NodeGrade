import { compactNodeWidgets, LiteGraph, wrapTextLines } from '@haski/ta-lib'
import type { LGraphNode } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

const measureStub = (widths: Record<string, number>, fallback = 5) => ({
  measureText: (text: string) => ({ width: widths[text] ?? text.length * fallback })
})

const stubContext = (widths: Record<string, number> = {}) => {
  const calls: string[] = []
  const fonts: string[] = []
  const fillStyles: string[] = []
  let font = ''
  let fillStyle = ''
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: (text: string) => {
      calls.push(text)
    },
    measureText: (text: string) => ({
      width: widths[text] ?? text.length * 5
    }),
    get font() {
      return font
    },
    set font(next: string) {
      font = next
      fonts.push(next)
    },
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(next: string) {
      fillStyle = next
      fillStyles.push(next)
    },
    textBaseline: '',
    textAlign: ''
  } as unknown as CanvasRenderingContext2D
  return {
    calls,
    fonts,
    fillStyles,
    draw: (node: LGraphNode) =>
      node.onDrawForeground?.(context, document.createElement('canvas'))
  }
}

const makeNode = (properties: Record<string, unknown>, size: [number, number]) => {
  const node = LiteGraph.createNode<LGraphNode>('input/question')
  node.properties = { ...properties }
  node.size = [...size] as unknown as LGraphNode['size']
  return node
}

const stubCanvas = () => ({
  allow_interaction: true,
  ds: { scale: 1 },
  convertOffsetToCanvas: (pos: [number, number]) => pos,
  setDirty: vi.fn(),
  canvas: {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    width: 800,
    height: 600
  }
})

const stubEvent = () =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  }) as unknown as MouseEvent

describe('wrapped text preview', () => {
  it('wraps long text over several lines instead of one truncated line', () => {
    const node = makeNode(
      {
        value:
          'Explain the Strategy design pattern, give a concrete example with two interchangeable strategies, and discuss one trade-off.'
      },
      [320, 200]
    )
    compactNodeWidgets(node)
    expect([...node.size]).toEqual([320, 200])
    const stub = stubContext()
    stub.draw(node)
    expect(stub.calls.length).toBeGreaterThan(1)
    expect(stub.calls.join(' ')).toContain('Explain the Strategy')
    expect(stub.calls.join(' ')).toContain('trade-off')
  })

  it('truncates with an ellipsis only when text overflows the node height', () => {
    const node = makeNode({ value: 'one two three four five six seven' }, [180, 64])
    compactNodeWidgets(node)
    const stub = stubContext()
    stub.draw(node)
    expect(stub.calls.length).toBe(1)
    expect(stub.calls[0]).toMatch(/…$/)
    node.size = [180, 200]
    const grown = stubContext()
    grown.draw(node)
    expect(grown.calls.length).toBeGreaterThan(1)
    expect(grown.calls.join(' ')).toContain('seven')
  })

  it('opens the inline editor on text click and edits the property', () => {
    const node = makeNode({ value: 'hello world, this is long enough' }, [320, 200])
    compactNodeWidgets(node)
    const canvas = stubCanvas()
    const event = stubEvent()
    // Title bar (y < 0) never starts editing.
    node.onMouseDown?.(event, [50, -10], canvas as never)
    expect(document.body.querySelectorAll('textarea')).toHaveLength(0)
    // Click on the text area opens exactly one editor.
    node.onMouseDown?.(event, [50, 60], canvas as never)
    const editors = document.body.querySelectorAll('textarea')
    expect(editors).toHaveLength(1)
    const editor = editors[0] as HTMLTextAreaElement
    expect(editor.value).toBe('hello world, this is long enough')
    // While editing, the canvas preview hides so text never doubles.
    const hidden = stubContext()
    hidden.draw(node)
    expect(hidden.calls).toHaveLength(0)
    // Typing commits live into the node property.
    editor.value = 'edited value'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    expect(node.properties.value).toBe('edited value')
    editor.blur()
    expect(document.body.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('cancels the inline edit on Escape', () => {
    const node = makeNode({ value: 'original text here' }, [320, 200])
    compactNodeWidgets(node)
    const canvas = stubCanvas()
    node.onMouseDown?.(stubEvent(), [50, 60], canvas as never)
    const editor = document.body.querySelector('textarea') as HTMLTextAreaElement
    // jsdom's textarea value setter does not fire oninput; drive the handler
    // through the committed property path instead.
    node.properties.value = 'unsaved draft'
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(node.properties.value).toBe('original text here')
    expect(document.body.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('keeps explicit line breaks instead of collapsing whitespace', () => {
    const node = makeNode({ value: 'first line\nsecond line here' }, [320, 200])
    compactNodeWidgets(node)
    const stub = stubContext()
    stub.draw(node)
    expect(stub.calls).toContain('first line')
    expect(stub.calls.join('|')).toContain('second line here')
  })

  it('preserves newlines and wraps on spaces as pure text', () => {
    const lines = wrapTextLines(
      measureStub({}) as CanvasRenderingContext2D,
      'a b\nc d',
      1000
    )
    expect(lines).toEqual(['a b', 'c d'])
  })

  it('installs click-to-edit without widgets and keeps node serializable', () => {
    const node = makeNode({ value: 'hello' }, [200, 100])
    expect(Reflect.get(node, 'widgets') ?? []).toHaveLength(0)
    compactNodeWidgets(node)
    expect(Reflect.get(node, 'widgets') ?? []).toHaveLength(0)
    expect(node.serialize_widgets).toBe(false)
    const serialized = node.serialize()
    expect(serialized.properties.value).toBe('hello')
    expect(typeof node.onMouseDown).toBe('function')
  })

  it('restores wrapped preview and edit hooks after configure (undo path)', () => {
    const node = makeNode({ value: 'hello world, this is a long question' }, [320, 130])
    compactNodeWidgets(node)
    const snapshot = node.serialize()
    node.configure({ ...snapshot, properties: { value: 'changed value here and more' } })
    compactNodeWidgets(node)
    const stub = stubContext()
    stub.draw(node)
    expect(stub.calls.length).toBeGreaterThan(0)
    expect(stub.calls.join(' ')).toContain('changed value')
  })

  it('questions, sample solutions and textfields share one render style', () => {
    const types = ['input/question', 'input/sample-solution', 'basic/textfield']
    const draws = types.map((type) => {
      const node = LiteGraph.createNode<LGraphNode>(type)
      compactNodeWidgets(node)
      const stub = stubContext()
      stub.draw(node)
      return { font: stub.fonts.at(-1), fillStyle: stub.fillStyles.at(-1) }
    })
    for (const draw of draws) {
      expect(draw.font).toBe('11px sans-serif')
      expect(draw.fillStyle).toBe('#d4d7dd')
    }
  })
})
