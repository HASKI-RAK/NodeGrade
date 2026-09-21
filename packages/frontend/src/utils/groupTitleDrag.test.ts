import type { LGraphCanvas, LGraphGroup, LGraphNode } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import { installGroupTitleDrag } from './groupTitleDrag'

type RuntimeGroup = LGraphGroup & {
  pos: [number, number]
  size: [number, number]
  font_size?: number
}

const group = (fontSize = 24) =>
  ({
    pos: [100, 200],
    size: [300, 180],
    font_size: fontSize
  }) as unknown as RuntimeGroup

const leftMouseDown = (): MouseEvent => {
  const event = new MouseEvent('mousedown', { button: 0 })
  Object.defineProperty(event, 'which', { value: 1 })
  return event
}

const makeCanvas = (
  selectedGroup: RuntimeGroup,
  pointer: [number, number],
  node: LGraphNode | null = null,
  onMouse: LGraphCanvas['onMouse'] = null
) => {
  const processMouseDown = vi.fn(function (this: LGraphCanvas, event: MouseEvent) {
    this.canvas_mouse[0] = pointer[0]
    this.canvas_mouse[1] = pointer[1]
    if (this.onMouse?.(event)) return
    if (!node) this.selected_group = selectedGroup
  })
  const canvas = {
    canvas_mouse: [0, 0],
    ds: { scale: 1 },
    graph: {
      getGroupOnPos: vi.fn(() => selectedGroup),
      getNodeOnPos: vi.fn(() => node)
    },
    onMouse,
    processMouseDown,
    selected_group: null,
    selected_group_resizing: false,
    visible_nodes: []
  } as unknown as LGraphCanvas

  // Mirrors the callback LiteGraph captures in its constructor before the
  // editor installs custom canvas behavior.
  const boundMouseDown = canvas.processMouseDown.bind(canvas)
  installGroupTitleDrag(canvas)

  return { boundMouseDown, canvas, processMouseDown }
}

describe('installGroupTitleDrag', () => {
  it('allows the constructor-bound handler to select a group from its title', () => {
    const selectedGroup = group()
    const { boundMouseDown, canvas } = makeCanvas(selectedGroup, [150, 215])

    boundMouseDown(leftMouseDown())

    expect(canvas.selected_group).toBe(selectedGroup)
  })

  it('stops the constructor-bound handler from selecting a group from its body', () => {
    const selectedGroup = group()
    const { boundMouseDown, canvas } = makeCanvas(selectedGroup, [150, 250])

    boundMouseDown(leftMouseDown())

    expect(canvas.selected_group).toBeNull()
  })

  it('preserves the stock resize interaction in the lower-right corner', () => {
    const selectedGroup = group()
    const { boundMouseDown, canvas } = makeCanvas(selectedGroup, [398, 378])

    boundMouseDown(leftMouseDown())

    expect(canvas.selected_group).toBe(selectedGroup)
  })

  it('allows nodes inside the group body to receive pointer-down handling', () => {
    const selectedGroup = group()
    const node = {} as LGraphNode
    const { boundMouseDown, canvas, processMouseDown } = makeCanvas(
      selectedGroup,
      [150, 250],
      node
    )

    boundMouseDown(leftMouseDown())

    expect(processMouseDown).toHaveBeenCalledOnce()
    expect(canvas.selected_group).toBeNull()
  })

  it('uses each group title font size as its draggable height', () => {
    const selectedGroup = group(36)
    const { boundMouseDown, canvas } = makeCanvas(selectedGroup, [150, 230])

    boundMouseDown(leftMouseDown())

    expect(canvas.selected_group).toBe(selectedGroup)
  })

  it('preserves an existing mouse hook', () => {
    const selectedGroup = group()
    const existingHook = vi.fn(() => true)
    const { boundMouseDown } = makeCanvas(selectedGroup, [150, 250], null, existingHook)

    boundMouseDown(leftMouseDown())

    expect(existingHook).toHaveBeenCalledOnce()
  })
})
