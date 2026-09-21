import type { LGraphCanvas, LGraphGroup } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import { installGroupTitleDrag } from './groupTitleDrag'

type RuntimeGroup = LGraphGroup & {
  pos: [number, number]
  font_size?: number
}

const group = (fontSize = 24) =>
  ({
    pos: [100, 200],
    font_size: fontSize
  }) as unknown as RuntimeGroup

const makeCanvas = (selectedGroup: RuntimeGroup, pointerY: number, resizing = false) => {
  const processMouseDown = vi.fn(function (this: LGraphCanvas) {
    this.selected_group = selectedGroup
    this.selected_group_resizing = resizing
    this.canvas_mouse[1] = pointerY
    return true
  })
  const canvas = {
    canvas_mouse: [0, 0],
    selected_group: null,
    selected_group_resizing: false,
    processMouseDown
  } as unknown as LGraphCanvas

  return { canvas, processMouseDown }
}

describe('installGroupTitleDrag', () => {
  it('keeps a group selected when dragging starts on its title', () => {
    const selectedGroup = group()
    const { canvas } = makeCanvas(selectedGroup, 215)
    installGroupTitleDrag(canvas)

    canvas.processMouseDown(new MouseEvent('mousedown'))

    expect(canvas.selected_group).toBe(selectedGroup)
  })

  it('clears the group movement selection when dragging starts in its body', () => {
    const selectedGroup = group()
    const { canvas } = makeCanvas(selectedGroup, 250)
    installGroupTitleDrag(canvas)

    canvas.processMouseDown(new MouseEvent('mousedown'))

    expect(canvas.selected_group).toBeNull()
  })

  it('preserves the stock group resize interaction', () => {
    const selectedGroup = group()
    const { canvas } = makeCanvas(selectedGroup, 275, true)
    installGroupTitleDrag(canvas)

    canvas.processMouseDown(new MouseEvent('mousedown'))

    expect(canvas.selected_group).toBe(selectedGroup)
  })

  it('uses each group title font size as its draggable height', () => {
    const selectedGroup = group(36)
    const { canvas } = makeCanvas(selectedGroup, 230)
    installGroupTitleDrag(canvas)

    canvas.processMouseDown(new MouseEvent('mousedown'))

    expect(canvas.selected_group).toBe(selectedGroup)
  })

  it('installs once', () => {
    const selectedGroup = group()
    const { canvas, processMouseDown } = makeCanvas(selectedGroup, 215)
    installGroupTitleDrag(canvas)
    const installedProcessMouseDown = canvas.processMouseDown
    installGroupTitleDrag(canvas)

    canvas.processMouseDown(new MouseEvent('mousedown'))

    expect(canvas.processMouseDown).toBe(installedProcessMouseDown)
    expect(processMouseDown).toHaveBeenCalledOnce()
  })
})
