import type { LGraphCanvas, LGraphGroup } from 'litegraph.js'

const DEFAULT_GROUP_TITLE_HEIGHT = 24

type CoordinateVector = {
  0: number
  1: number
}

type PositionedGroup = LGraphGroup & {
  pos: CoordinateVector
  size: CoordinateVector
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
  'pos' in group &&
  isCoordinateVector(group.pos) &&
  'size' in group &&
  isCoordinateVector(group.size)

/**
 * Restrict LiteGraph group movement to pointer drags that start on the title.
 * The stock resize handle in the lower-right corner remains available.
 */
export const installGroupTitleDrag = (canvas: LGraphCanvas): void => {
  const runtime: GroupTitleDragCanvas = canvas
  if (runtime.__groupTitleDragInstalled) return
  runtime.__groupTitleDragInstalled = true

  // LiteGraph binds its DOM pointer-down listener in the constructor, before
  // editor canvas installers run. `onMouse` is evaluated by that bound
  // listener, so it remains a reliable interception point after construction.
  const onMouse = runtime.onMouse?.bind(runtime)
  runtime.onMouse = (event) => {
    if (onMouse?.(event)) return true
    if (event.which !== 1) return false

    const [pointerX, pointerY] = runtime.canvas_mouse
    const node = runtime.graph.getNodeOnPos(pointerX, pointerY, runtime.visible_nodes, 5)
    if (node) return false

    const group = runtime.graph.getGroupOnPos(pointerX, pointerY)
    if (!group || !isPositionedGroup(group)) return false

    const resizeDistance = Math.hypot(
      pointerX - (group.pos[0] + group.size[0]),
      pointerY - (group.pos[1] + group.size[1])
    )
    if (resizeDistance * runtime.ds.scale < 10) return false

    const titleHeight =
      typeof group.font_size === 'number' && group.font_size > 0
        ? group.font_size
        : DEFAULT_GROUP_TITLE_HEIGHT
    const titleBottom = group.pos[1] + titleHeight

    return pointerY < group.pos[1] || pointerY > titleBottom
  }
}
