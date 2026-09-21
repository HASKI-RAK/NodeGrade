import { CANVAS_THEME, LiteGraph } from '@haski/ta-lib'
import type { LGraphCanvas } from 'litegraph.js'

const DEFAULT_GROUP_TITLE_HEIGHT = 24

type CoordinateVector = {
  0: number
  1: number
}

type DrawableGroup = {
  _pos: CoordinateVector
  _size: CoordinateVector
  font_size?: number
  title: string
}

type GroupTitleStyleCanvas = LGraphCanvas & {
  __groupTitleStyleInstalled?: boolean
}

const isCoordinateVector = (value: unknown): value is CoordinateVector =>
  typeof value === 'object' &&
  value !== null &&
  0 in value &&
  typeof value[0] === 'number' &&
  1 in value &&
  typeof value[1] === 'number'

const isDrawableGroup = (value: unknown): value is DrawableGroup =>
  typeof value === 'object' &&
  value !== null &&
  '_pos' in value &&
  isCoordinateVector(value._pos) &&
  '_size' in value &&
  isCoordinateVector(value._size) &&
  'title' in value &&
  typeof value.title === 'string'

const runtimeGroups = (graph: unknown): DrawableGroup[] => {
  if (typeof graph !== 'object' || graph === null || !('_groups' in graph)) return []
  if (!Array.isArray(graph._groups)) return []
  return graph._groups.filter(isDrawableGroup)
}

/** Paint a solid header over LiteGraph's translucent group body. */
export const installGroupTitleStyle = (canvas: LGraphCanvas): void => {
  const runtime: GroupTitleStyleCanvas = canvas
  if (runtime.__groupTitleStyleInstalled) return
  runtime.__groupTitleStyleInstalled = true

  const drawGroups = runtime.drawGroups.bind(runtime)
  runtime.drawGroups = (element, context) => {
    drawGroups(element, context)

    context.save()
    context.globalAlpha = runtime.editor_alpha
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'

    for (const group of runtimeGroups(runtime.graph)) {
      const fontSize =
        typeof group.font_size === 'number' && group.font_size > 0
          ? group.font_size
          : DEFAULT_GROUP_TITLE_HEIGHT
      const titleHeight = Math.min(fontSize, group._size[1] - 1)

      context.fillStyle = CANVAS_THEME.nodeTitle
      context.fillRect(
        group._pos[0] + 1,
        group._pos[1] + 1,
        group._size[0] - 1,
        titleHeight
      )
      context.fillStyle = LiteGraph.NODE_TITLE_COLOR
      context.font = `${fontSize}px Arial`
      context.fillText(group.title, group._pos[0] + 4, group._pos[1] + fontSize)
    }

    context.restore()
  }
}
