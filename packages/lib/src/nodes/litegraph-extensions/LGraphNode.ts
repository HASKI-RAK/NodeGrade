import {
  INodeInputSlot,
  INodeOutputSlot,
  LGraphNode as LGN,
  LGraph,
  LiteGraph
} from 'litegraph.js'
import { WebSocket } from 'ws'

import WebSocketNode from '../behavior/WebSocketNode'
import { InOut } from '../types/NodeLinkMessage'
import { ServerEventPayload } from '../../events'
import type { ModelExecutionWarning } from '../types/ModelRef'
import type { NodeCategory } from '../NodeDefinition'

/**
 * Opaque port color per link type. Shared by slot dots and wires so a
 * connection reads as the type it carries. No alpha: translucent dots wash
 * out on the dark canvas and look identical when unconnected.
 */
export const LINK_TYPE_COLORS: Record<InOut, string> = {
  string: '#4ADE80',
  number: '#60A5FA',
  boolean: '#A78BFA',
  message: '#FACC15',
  '[number]': '#22D3EE',
  '[string]': '#F472B6',
  image: '#FB923C',
  '*': '#E2E8F0'
}

/**
 * Shape per link type (double-encodes color for colorblind users).
 * Circles read as scalars, the arrow as the message envelope, the grid as
 * vector/array payloads, the box as the untyped wildcard. The numeric literal
 * 6 is LiteGraph.GRID_SHAPE at runtime; the shipped .d.ts misnames it
 * SQUARE_SHAPE, so the constant is inlined to keep `tsc` honest.
 */
const GRID_SHAPE = 6
export const LINK_TYPE_SHAPES: Record<InOut, number> = {
  string: LiteGraph.CIRCLE_SHAPE,
  number: LiteGraph.CIRCLE_SHAPE,
  boolean: LiteGraph.CIRCLE_SHAPE,
  image: LiteGraph.CIRCLE_SHAPE,
  message: LiteGraph.ARROW_SHAPE,
  '[number]': GRID_SHAPE,
  '[string]': GRID_SHAPE,
  '*': LiteGraph.BOX_SHAPE
}

/** Title-bar tint per node category (design A header stripe). */
export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  AI: '#A78BFA',
  Essential: '#2DD4BF',
  Validation: '#60A5FA',
  Assessment: '#FBBF24'
}

interface ILGraphNode extends LGN {
  onExecute(): Promise<void>
  init?(env: Record<string, unknown>): void
  env?: Record<string, unknown>
  addOut<T extends InOut>(
    type: T,
    name?: string,
    extra_info?: Partial<INodeOutputSlot>
  ): INodeOutputSlot
  addIn(type: InOut, name?: string, extra_info?: Partial<INodeInputSlot>): INodeInputSlot
}

// extend the LGraphNode class by adding a new method
export abstract class LGraphNode extends LGN implements ILGraphNode, WebSocketNode {
  env?: Record<string, unknown> | undefined

  /** Transient execution context. Never serialized with the graph. */
  executionSignal?: AbortSignal

  /** Transient warnings produced by the current execution. */
  executionWarnings?: ModelExecutionWarning[]

  emitEventCallback?(event: {
    eventName: keyof ServerEventPayload
    payload: unknown
  }): void

  static path: string
  static getPath(): string {
    throw new Error('getPath() not implemented')
  }
  async onExecute(): Promise<void> {
    throw new Error('onExecute() not implemented')
  }

  /**
   * @deprecated use addIn() instead
   */
  addInput(
    name: string | undefined,
    type: InOut,
    extra_info?: Partial<INodeInputSlot> | undefined
  ): INodeInputSlot {
    throw new Error(
      'deprecated. Called with: ' + type + name + extra_info + ' but use addIn() instead'
    )
  }

  /**
   * @deprecated use addIn() instead
   */
  addInputs(array: [string, string | -1, Partial<INodeInputSlot> | undefined][]): void {
    throw new Error('deprecated. Called with: ' + array + ' but use addIn() instead')
  }

  /**
   * @deprecated use addOut() instead
   */
  addOutputs(array: [string, string | -1, Partial<INodeOutputSlot> | undefined][]): void {
    throw new Error('deprecated. Called with: ' + array + ' but use addOut() instead')
  }

  /**
   * @deprecated use addOut() instead
   */
  addOutput(
    name: string,
    type: string | -1,
    extra_info?: Partial<INodeOutputSlot> | undefined
  ): INodeOutputSlot {
    throw new Error(
      'deprecated. Called with: ' + name + type + extra_info + ' but use addOut() instead'
    )
  }

  /**
   * Adds an input slot to the node.
   * @param type - The type of the input slot.
   * @param name - The name of the input slot. Optional.
   * @param extra_info - Additional information for the input slot. Optional.
   * @returns The added input slot.
   */
  addIn(
    type: InOut,
    name?: string | undefined,
    extra_info?: Partial<INodeInputSlot> | undefined
  ): INodeInputSlot {
    const _name = name ?? type
    return super.addInput(_name, type, {
      ...LGraphNode.mapLinkTypeToColor(type),
      shape: LINK_TYPE_SHAPES[type],
      ...extra_info
    })
  }

  /**
   * Adds an output slot to the node.
   * @template T - The type of the output slot.
   * @param type - The type of the output slot.
   * @param name - The name of the output slot (optional).
   * @param extra_info - Additional information for the output slot (optional).
   * @returns The added output slot.
   */
  addOut<T extends InOut>(
    type: T,
    name?: string,
    extra_info?: Partial<INodeOutputSlot>
  ): INodeOutputSlot {
    const _name = name ?? type
    return super.addOutput(_name, type, {
      ...LGraphNode.mapLinkTypeToColor(type),
      shape: LINK_TYPE_SHAPES[type],
      ...extra_info
    })
  }

  /**
   * when added to graph (warning: this is called BEFORE the node is configured when loading)
   * Called by `LGraph.add`
   */
  async onAdded?(graph: LGraph): Promise<void> {
    if (this.env) {
      this.init?.(this.env)
    }
  }

  /**
   * Reapplies the shared port style after `configure()` overwrites slots with
   * serialized values. Old graphs carry translucent colors and no shape, so
   * without this they keep the bleak look forever. Takes the serialized info
   * so subclasses (LLMNode) can extend the signature without a type clash.
   */
  onConfigure(_info?: unknown): void {
    for (const slot of [...(this.inputs ?? []), ...(this.outputs ?? [])]) {
      const type = slot.type as InOut
      const color = LINK_TYPE_COLORS[type]
      if (color) {
        slot.color_off = color
        slot.color_on = color
      }
      const shape = LINK_TYPE_SHAPES[type]
      if (shape !== undefined) slot.shape = shape
    }
  }

  /**
   * Draws the category pill in the title bar (design B element). Implemented
   * as `onDrawTitleBox` (not `onDrawForeground`): LiteGraph paints the title
   * string after the foreground pass, so a foreground pill always ends up
   * underneath the title text, and the default title text after
   * `onDrawTitleText` would overpaint that hook too. The title box hook runs
   * before the text, so drawing the pill here puts it above the bar
   * background and below nothing else — then the clipped title below stops
   * at the pill gutter. Runs in node local coordinates, title bar y [-30, 0].
   * `compactNodeWidgets` wraps `onDrawForeground`, never this hook, so the
   * pill and the preview text compose instead of clobbering each other.
   */
  onDrawTitleBox(
    context: CanvasRenderingContext2D,
    titleHeight: number,
    size: [number, number],
    scale: number,
    titleFont: string
  ): void {
    const ctor = this.constructor as typeof LGraphNode & {
      definition?: { category?: NodeCategory }
      boxcolor?: string
    }
    const label = ctor.definition?.category
    // Always draw the status dot (LiteGraph default) so uncategorized nodes
    // keep their look; the pill only applies to categorized nodes.
    const boxSize = 10
    context.fillStyle =
      this.boxcolor ?? ctor.boxcolor ?? LiteGraph.NODE_DEFAULT_BOXCOLOR
    context.beginPath()
    context.arc(
      titleHeight * 0.5,
      titleHeight * -0.5,
      boxSize * 0.5,
      0,
      Math.PI * 2
    )
    context.fill()
    if (!label || this.flags?.collapsed) return
    const fill = CATEGORY_COLORS[label]
    if (!fill) return
    const text = label.toUpperCase()
    context.save()
    context.font = 'bold 10px Tahoma, sans-serif'
    const paddingX = 8
    const width = context.measureText(text).width + paddingX * 2
    const height = 16
    // Right-align the pill against the node edge, then widen short nodes so
    // the title never starts underneath the pill. Growing the node (instead
    // of only clipping the text) keeps full titles like "Concat Object" and
    // "Cosine Similarity" readable instead of truncated to "Conc…". Measure
    // the title in the real title font so the gutter accounts for the actual
    // rendered width, not the 10px pill font.
    context.font = titleFont
    const titleWidth = context.measureText(String(this.getTitle() ?? '')).width
    const gap = 10
    const minWidth = Math.ceil(
      titleHeight + gap + titleWidth + gap + width + 8
    )
    // Scale-aware: size is in graph units, so divide the pixel overshoot out.
    void scale
    if (this.size[0] < minWidth) {
      this.size[0] = minWidth
      size[0] = minWidth
    }
    const x = size[0] - width - 8
    const y = -titleHeight + (titleHeight - height) / 2
    context.fillStyle = fill
    context.beginPath()
    if (typeof context.roundRect === 'function')
      context.roundRect(x, y, width, height, 6)
    else context.rect(x, y, width, height)
    context.fill()
    context.fillStyle = '#14161C'
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillText(text, x + paddingX, y + height / 2 + 0.5)
    context.restore()
    // Stash the pill edge for `onDrawTitleText` clipping below.
    Reflect.set(this, '__pillGutterX', x - 6)
  }

  /**
   * Clips the default title string so long titles stop at the pill gutter
   * instead of running underneath the pill. Delegates to the default
   * rendering otherwise (LiteGraph has no "default title text" helper, so
   * the standard fill is reproduced with a clip region).
   */
  onDrawTitleText(
    context: CanvasRenderingContext2D,
    titleHeight: number,
    size: [number, number],
    _scale: number,
    font: string,
    selected: boolean
  ): void {
    const ctor = this.constructor as typeof LGraphNode & {
      title_text_color?: string
    }
    const title = String(this.getTitle() ?? '')
    // NODE_SELECTED_TITLE_COLOR exists at runtime but is missing from the
    // shipped .d.ts; read it defensively so `tsc` stays honest.
    const selectedColor = Reflect.get(LiteGraph, 'NODE_SELECTED_TITLE_COLOR')
    context.font = font
    context.fillStyle = selected
      ? (typeof selectedColor === 'string' ? selectedColor : '#FFF')
      : (ctor.title_text_color ?? LiteGraph.NODE_TITLE_COLOR)
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    const gutter = Reflect.get(this, '__pillGutterX')
    context.save()
    context.beginPath()
    context.rect(
      0,
      -titleHeight,
      typeof gutter === 'number' ? Math.max(gutter, 0) : size[0],
      titleHeight
    )
    context.clip()
    context.fillText(title, titleHeight, LiteGraph.NODE_TITLE_TEXT_Y - titleHeight)
    context.restore()
  }

  /**
   * Maps the link type to a color object.
   * @param type The link type.
   * @returns The color object corresponding to the link type.
   */
  static mapLinkTypeToColor(
    type: InOut
  ): { color_off: string; color_on: string } | undefined {
    const color = LINK_TYPE_COLORS[type]
    if (!color) return undefined
    return { color_off: color, color_on: color }
  }
  init?(env: Record<string, unknown>): Promise<void>
}

export default LGraphNode
