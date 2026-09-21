import type { LGraphCanvas, LGraphGroup } from 'litegraph.js'

const DEFAULT_GROUP_TITLE_HEIGHT = 24

type CoordinateVector = {
  0: number
  1: number
}

type PositionedGroup = LGraphGroup & {
  pos: CoordinateVector
  font_size?: number
}

type GroupTitleDragCanvas = LGraphCanvas & {
  __groupTitleDragInstalled?: boolean
}

const isCoordinateVector = (value: unknown): value is CoordinateVector =>
  typeof value === 'object' &&
  value !== null &&
  0 in value &&
  typeof value[0] === 'number' &&
  1 in value &&
  typeof value[1] === 'number'

const isPositionedGroup = (group: LGraphGroup): group is PositionedGroup =>
  'pos' in group && isCoordinateVector(group.pos)

/**
 * Restrict LiteGraph group movement to pointer drags that start on the title.
 * The stock resize handle in the lower-right corner remains available.
 */
export const installGroupTitleDrag = (canvas: LGraphCanvas): void => {
  const runtime: GroupTitleDragCanvas = canvas
  if (runtime.__groupTitleDragInstalled) return
  runtime.__groupTitleDragInstalled = true

  const processMouseDown = runtime.processMouseDown.bind(runtime)
  runtime.processMouseDown = (event) => {
    const result = processMouseDown(event)
    const group = runtime.selected_group

    if (!group || runtime.selected_group_resizing || !isPositionedGroup(group))
      return result

    const titleHeight =
      typeof group.font_size === 'number' && group.font_size > 0
        ? group.font_size
        : DEFAULT_GROUP_TITLE_HEIGHT
    const pointerY = runtime.canvas_mouse[1]
    const titleBottom = group.pos[1] + titleHeight

    if (pointerY < group.pos[1] || pointerY > titleBottom) runtime.selected_group = null

    return result
  }
}
