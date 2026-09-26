/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LINK_TYPE_COLORS, LiteGraph } from './litegraph-extensions'
import type { InOut } from './types/NodeLinkMessage'
import {
  fitLinesToBox,
  WRAPPED_TEXT_COLOR,
  WRAPPED_TEXT_FONT,
  WRAPPED_TEXT_LINE_HEIGHT,
  WRAPPED_TEXT_PAD_BOTTOM,
  WRAPPED_TEXT_PAD_X,
  wrappedTextTop,
  wrapTextLines
} from './widgets/WrappedTextPreview'

/** Name of the trace row that carries the watched value. */
export const WATCH_DETAIL_NAME = 'value'

/** Space between the input row and the type line. */
const WATCH_GAP = 4

/** Room for the input row, the type line and two value lines. */
export const WATCH_MIN_HEIGHT =
  22 + WATCH_GAP + WRAPPED_TEXT_LINE_HEIGHT * 3 + WRAPPED_TEXT_PAD_BOTTOM

const WATCH_TEXT_LIMIT = 2000

/** What a watch node shows: the value as the run produced it, and its kind. */
export type WatchedValue = {
  type: string
  value: unknown
  /** The server cut the value at the trace limit; `value` is then a JSON prefix. */
  truncated: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isMessage = (value: unknown): value is { role: string; content: unknown } =>
  isRecord(value) && typeof value.role === 'string' && 'content' in value

const isImage = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:image/')

/**
 * The kind of a runtime value, named like the port types where one fits
 * (`string`, `[number]`, `message`, `image`, …) so the watch speaks the same
 * vocabulary as the wires. Values no port type describes fall back to
 * `object`, `array`, `null` and `undefined`.
 */
export const describeWatchType = (value: unknown): string => {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (isImage(value)) return 'image'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array'
    if (value.every((item) => typeof item === 'number')) return '[number]'
    if (value.every((item) => typeof item === 'string')) return '[string]'
    if (value.every(isMessage)) return '[message]'
    return 'array'
  }
  if (isMessage(value)) return 'message'
  if (typeof value === 'bigint') return 'number'
  return typeof value
}

const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

const toJson = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

const formatMessage = (message: { role: string; content: unknown }): string =>
  `${message.role}: ${
    typeof message.content === 'string' ? message.content : toJson(message.content)
  }`

/** Readable text for any value a wire can carry. */
export const formatWatchValue = (value: unknown): string => {
  if (value === undefined) return 'no value'
  if (value === null) return 'null'
  if (typeof value === 'string') {
    if (isImage(value)) {
      const mime = value.slice('data:'.length, value.indexOf(';'))
      const base64 = value.slice(value.indexOf(',') + 1)
      return `${mime} · ${formatBytes(Math.floor((base64.length * 3) / 4))}`
    }
    return value === '' ? '(empty string)' : value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  if (isMessage(value)) return formatMessage(value)
  if (Array.isArray(value) && value.length > 0 && value.every(isMessage))
    return value.map(formatMessage).join('\n')
  return toJson(value)
}

/** The type line: the kind, plus the length of lists and text. */
export const describeWatchHeader = ({ type, value, truncated }: WatchedValue): string => {
  const size = truncated
    ? 'truncated'
    : Array.isArray(value)
      ? `${value.length} item${value.length === 1 ? '' : 's'}`
      : typeof value === 'string' && type === 'string'
        ? `${value.length} char${value.length === 1 ? '' : 's'}`
        : undefined
  return size ? `${type} · ${size}` : type
}

export class Watch extends LGraphNode {
  /**
   * Last value shown. Deliberately not a property: properties are serialized,
   * so every run would rewrite the workflow and trigger an autosave.
   */
  watched?: WatchedValue
  private watchedText = ''

  constructor() {
    super()
    this.addIn('*', 'value')
    this.properties = {}
    this.title = 'watch'
    this.size = [220, WATCH_MIN_HEIGHT + WRAPPED_TEXT_LINE_HEIGHT]
  }

  //name of the node
  static title = 'watch'
  static desc = 'Shows the input value'
  static path = 'basic/watch'
  static getPath(): string {
    return Watch.path
  }

  /**
   * The graph runs on the server, so the value reaches the editor as a trace
   * row; the editor hands it back to this node through `showValue`.
   */
  async onExecute() {
    const value = this.getInputData(0)
    this.executionDetails = [
      {
        slot: 0,
        name: WATCH_DETAIL_NAME,
        type: describeWatchType(value),
        value,
        truncated: false
      }
    ]
  }

  showValue(watched: WatchedValue): void {
    this.watched = watched
    const text =
      watched.truncated && typeof watched.value === 'string'
        ? `${watched.value}…`
        : formatWatchValue(watched.value)
    // The canvas wraps this on every frame; a few lines is all it can show,
    // and the trace view keeps the whole value.
    this.watchedText =
      text.length > WATCH_TEXT_LIMIT ? `${text.slice(0, WATCH_TEXT_LIMIT)}…` : text
    this.setDirtyCanvas(true, false)
  }

  clearValue(): void {
    this.watched = undefined
    this.watchedText = ''
    this.setDirtyCanvas(true, false)
  }

  /**
   * Graphs saved before the watch drew its own body kept the last value in
   * the input label (`0.000`); drop it so the port reads as a port again.
   */
  onConfigure(info?: unknown): void {
    super.onConfigure(info)
    const input = this.inputs?.[0]
    if (input) delete input.label
  }

  getTitle(): string {
    if (this.flags?.collapsed && this.watched) {
      return `${this.title}: ${this.watchedText.replace(/\s+/g, ' ').slice(0, 40)}`
    }
    return this.title
  }

  onDrawForeground(context: CanvasRenderingContext2D): void {
    if (this.flags?.collapsed) return
    const width = this.size[0] - WRAPPED_TEXT_PAD_X * 2
    if (width <= 0) return
    const top = wrappedTextTop(this) + WATCH_GAP
    context.save()
    context.font = WRAPPED_TEXT_FONT
    context.textBaseline = 'top'
    context.textAlign = 'left'
    if (!this.watched) {
      context.fillStyle = LiteGraph.NODE_TEXT_COLOR
      context.fillText('Run the workflow to see the value.', WRAPPED_TEXT_PAD_X, top, width)
      context.restore()
      return
    }
    context.fillStyle =
      LINK_TYPE_COLORS[this.watched.type as InOut] ?? LiteGraph.NODE_TEXT_COLOR
    context.fillText(describeWatchHeader(this.watched), WRAPPED_TEXT_PAD_X, top, width)
    const available = this.size[1] - top - WRAPPED_TEXT_LINE_HEIGHT - WRAPPED_TEXT_PAD_BOTTOM
    const { visible } = fitLinesToBox(
      wrapTextLines(context, this.watchedText, width),
      Math.floor(available / WRAPPED_TEXT_LINE_HEIGHT)
    )
    context.fillStyle = WRAPPED_TEXT_COLOR
    visible.forEach((line, index) =>
      context.fillText(line, WRAPPED_TEXT_PAD_X, top + WRAPPED_TEXT_LINE_HEIGHT * (index + 1))
    )
    context.restore()
  }
}
