/* eslint-disable immutable/no-mutation */
import type { LGraphCanvas, LGraphNode, Vector2 } from 'litegraph.js'

/**
 * Wrapped compact text preview with seamless click-to-edit.
 *
 * This is the third design for free-text `keyValue` properties (Question,
 * Sample solution, Textfield): it keeps the compact look — no opaque canvas
 * widget, `11px sans-serif` in `#d4d7dd` — but word-wraps over every line the
 * node height allows instead of truncating to one line. The only truncation
 * is an `…` on the last visible line when text would overflow the node, so
 * resizing the node reveals more text.
 *
 * Editing opens a DOM `<textarea>` overlay styled to the same font metrics,
 * so the swap from canvas text to editable text has no visible jump: the
 * cursor simply appears where the user clicked. It commits on Enter/blur,
 * cancels on Escape, and follows zoom/pan/resize/move via rAF like the old
 * `Textfield.onMouseDown` editor did.
 */

export const WRAPPED_TEXT_FONT = '11px sans-serif'
export const WRAPPED_TEXT_COLOR = '#d4d7dd'
export const WRAPPED_TEXT_LINE_HEIGHT = 13
export const WRAPPED_TEXT_PAD_X = 10
export const WRAPPED_TEXT_PAD_BOTTOM = 9
export const WRAPPED_TEXT_ELLIPSIS = '…'

const FLAG = '__wrappedTextApplied'
const EDIT_INPUT_ID = (node: LGraphNode): string => `wrappedText${node.id}`

/** Top edge of the text area: below the port rows, never inside the slots. */
export const wrappedTextTop = (node: LGraphNode): number => {
  const portRows = Math.max(node.inputs?.length ?? 0, node.outputs?.length ?? 0)
  return Math.max(30, portRows * 20 + 14)
}

/** Read the text value, tolerating the `{ content }` envelope some nodes use. */
export const readTextValue = (node: LGraphNode, key: string): string => {
  const raw = node.properties[key]
  const nested =
    typeof raw === 'object' && raw !== null
      ? Reflect.get(raw as object, 'content')
      : raw
  return String(nested ?? '')
}

const splitLongWord = (
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number
): string[] => {
  const parts: string[] = []
  let part = ''
  for (const char of word) {
    const candidate = part + char
    if (part && context.measureText(candidate).width > maxWidth) {
      parts.push(part)
      part = char
    } else {
      part = candidate
    }
  }
  if (part) parts.push(part)
  return parts.length ? parts : ['']
}

/**
 * Word-wrap paragraphs for a canvas context. Keeps explicit newlines (unlike
 * the old single-line preview, which collapsed all whitespace), wraps on
 * spaces, and char-splits words longer than the line. Pure: takes the text
 * and width, returns wrapped lines with no truncation applied.
 */
export const wrapTextLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    const words = paragraph.split(' ').filter((part) => part.length > 0)
    if (!words.length) {
      lines.push('')
      continue
    }
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate
      } else if (!line) {
        // Single word wider than the box: spill it across lines.
        const parts = splitLongWord(context, word, maxWidth)
        line = parts.pop() ?? ''
        lines.push(...parts)
      } else {
        lines.push(line)
        if (context.measureText(word).width <= maxWidth) {
          line = word
        } else {
          const parts = splitLongWord(context, word, maxWidth)
          line = parts.pop() ?? ''
          lines.push(...parts)
        }
      }
    }
    lines.push(line)
  }
  return lines
}

/**
 * Fit wrapped lines into the visible row budget, appending an ellipsis to the
 * last visible line when text overflows. `maxLines <= 0` means no room.
 */
export const fitLinesToBox = (
  lines: string[],
  maxLines: number
): { visible: string[]; truncated: boolean } => {
  if (maxLines <= 0) return { visible: [], truncated: lines.length > 0 }
  if (lines.length <= maxLines) return { visible: lines, truncated: false }
  const visible = lines.slice(0, maxLines)
  const last = visible[maxLines - 1] ?? ''
  visible[maxLines - 1] = last ? `${last}${WRAPPED_TEXT_ELLIPSIS}` : WRAPPED_TEXT_ELLIPSIS
  return { visible, truncated: true }
}

/** Paint every visible line; the caller owns save/restore and font setup. */
const paintLines = (
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number
): void => {
  let cursor = y
  for (const line of lines) {
    context.fillText(line, x, cursor)
    cursor += WRAPPED_TEXT_LINE_HEIGHT
  }
}

const isEditing = (node: LGraphNode): boolean => {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function')
    return false
  return document.getElementById(EDIT_INPUT_ID(node)) !== null
}

/** Draw the wrapped preview. Skips collapsed nodes and active edit sessions. */
export const drawWrappedText = (
  node: LGraphNode,
  context: CanvasRenderingContext2D,
  key: string
): void => {
  if (node.flags?.collapsed || isEditing(node)) return
  const value = readTextValue(node, key)
  if (!value) return
  const width = node.size[0] - WRAPPED_TEXT_PAD_X * 2
  if (width <= 0) return
  const top = wrappedTextTop(node)
  const available = node.size[1] - top - WRAPPED_TEXT_PAD_BOTTOM
  const maxLines = Math.floor(available / WRAPPED_TEXT_LINE_HEIGHT)
  if (maxLines <= 0) return
  context.save()
  context.fillStyle = WRAPPED_TEXT_COLOR
  context.font = WRAPPED_TEXT_FONT
  context.textBaseline = 'top'
  context.textAlign = 'left'
  const { visible } = fitLinesToBox(wrapTextLines(context, value, width), maxLines)
  paintLines(context, visible, WRAPPED_TEXT_PAD_X, top)
  context.restore()
}

type TextGraphCanvas = LGraphCanvas & {
  ds: { scale: number }
  convertOffsetToCanvas: (pos: Vector2) => Vector2
  setDirty: (fg: boolean, bg: boolean) => void
  canvas: HTMLCanvasElement
}

/**
 * Install the wrapped preview plus click-to-edit on a node. Idempotent:
 * re-entrant calls (undo restore, palette re-add) only refresh the chained
 * hooks once, and the previous `onDrawForeground`/`onMouseDown` are always
 * preserved.
 */
export const applyWrappedText = (node: LGraphNode, key: string): void => {
  if (Reflect.get(node, FLAG)) return
  const previousDraw = Reflect.get(node, 'onDrawForeground')
  const previousMouseDown = Reflect.get(node, 'onMouseDown')
  Reflect.set(node, FLAG, { key })
  Reflect.set(
    node,
    'onDrawForeground',
    function (this: LGraphNode, context: CanvasRenderingContext2D) {
      if (typeof previousDraw === 'function')
        Reflect.apply(previousDraw, this, [context])
      drawWrappedText(this, context, key)
    }
  )
  Reflect.set(
    node,
    'onMouseDown',
    function (this: LGraphNode, event: MouseEvent, pos: Vector2, canvas: LGraphCanvas) {
      if (typeof previousMouseDown === 'function') {
        Reflect.apply(previousMouseDown, this, [event, pos, canvas])
        if (event.defaultPrevented) return true
      }
      if (startInlineEdit(this, key, event, pos, canvas)) return true
      return undefined
    }
  )
}

/** Whether a click position falls inside the rendered text rectangle. */
export const isInsideTextArea = (node: LGraphNode, pos: Vector2): boolean => {
  const top = wrappedTextTop(node)
  return (
    pos[1] >= top - 4 &&
    pos[1] <= node.size[1] - 2 &&
    pos[0] >= 2 &&
    pos[0] <= node.size[0] - 2
  )
}

/**
 * Open the inline editor when the click lands on rendered text. Returns false
 * when another handler should own the event (title bar, ports, resize corner,
 * collapsed node, read-only canvas, already editing).
 */
export const startInlineEdit = (
  node: LGraphNode,
  key: string,
  event: MouseEvent,
  pos: Vector2,
  graphCanvas: LGraphCanvas
): boolean => {
  if (typeof document === 'undefined') return false
  if (node.flags?.collapsed) return false
  if (pos[1] < 0) return false
  if (!isInsideTextArea(node, pos)) return false
  // Keep the resize handle (bottom-right 10x10 graph units) draggable.
  if (
    pos[0] >= node.size[0] - 10 &&
    pos[1] >= node.size[1] - 10
  )
    return false
  const canvas = graphCanvas as unknown as TextGraphCanvas
  if (canvas.allow_interaction === false) return false
  if (document.getElementById(EDIT_INPUT_ID(node))) return false
  event.preventDefault()
  event.stopPropagation()

  const host = canvas.canvas
  const oldValue = readTextValue(node, key)
  const input = document.createElement('textarea')
  input.id = EDIT_INPUT_ID(node)
  input.value = oldValue
  input.setAttribute('aria-label', 'Edit node text')
  input.spellcheck = false
  // Match the canvas preview exactly so opening the editor shows the cursor
  // with no visible jump: same font, color, line height, padding and origin.
  input.style.position = 'fixed'
  input.style.zIndex = '1000'
  input.style.boxSizing = 'border-box'
  input.style.border = 'none'
  input.style.margin = '0px'
  input.style.outline = 'none'
  input.style.padding = `0px 0px 0px ${WRAPPED_TEXT_PAD_X}px`
  input.style.font = WRAPPED_TEXT_FONT
  input.style.lineHeight = `${WRAPPED_TEXT_LINE_HEIGHT}px`
  input.style.color = WRAPPED_TEXT_COLOR
  input.style.backgroundColor = '#2B2D3A'
  input.style.borderRadius = '2px'
  input.style.resize = 'none'
  input.style.overflow = 'hidden'
  input.style.whiteSpace = 'pre-wrap'
  input.style.overflowWrap = 'break-word'

  let animationFrameId: number | undefined
  const updateInputBounds = (): void => {
    if (!input.isConnected) return
    const rect = host.getBoundingClientRect()
    const top = wrappedTextTop(node)
    const [canvasX, canvasY] = canvas.convertOffsetToCanvas([
      node.pos[0],
      node.pos[1] + top
    ])
    const cssPerUnitX = rect.width / host.width
    const cssPerUnitY = rect.height / host.height
    const scaleY = canvas.ds.scale * cssPerUnitY
    input.style.left = `${rect.left + (canvasX + WRAPPED_TEXT_PAD_X) * cssPerUnitX}px`
    // Text starts `top` graph units below the node origin, including the
    // title offset; convertOffsetToCanvas already accounts for pan/zoom.
    input.style.top = `${rect.top + canvasY * cssPerUnitY}px`
    input.style.width = `${Math.max(0, node.size[0] - WRAPPED_TEXT_PAD_X * 2) * cssPerUnitX}px`
    input.style.height = `${Math.max(0, node.size[1] - top - WRAPPED_TEXT_PAD_BOTTOM + 4) * cssPerUnitY}px`
    input.style.fontSize = `${11 * scaleY}px`
    input.style.lineHeight = `${WRAPPED_TEXT_LINE_HEIGHT * scaleY}px`
    animationFrameId = window.requestAnimationFrame(updateInputBounds)
  }

  let isFinishing = false
  const finishEditing = (commit: boolean): void => {
    if (isFinishing) return
    isFinishing = true
    input.onblur = null
    if (animationFrameId !== undefined) {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = undefined
    }
    if (commit) commitValue(node, key, input.value)
    else commitValue(node, key, oldValue)
    if (input.isConnected) input.remove()
    canvas.setDirty(true, true)
  }

  input.oninput = () => {
    commitValue(node, key, input.value)
  }
  input.onblur = () => finishEditing(true)
  input.onkeydown = (keyboard: KeyboardEvent) => {
    keyboard.stopPropagation()
    if (keyboard.key === 'Enter' && !keyboard.shiftKey) {
      keyboard.preventDefault()
      finishEditing(true)
    }
    if (keyboard.key === 'Escape') {
      keyboard.preventDefault()
      finishEditing(false)
    }
  }

  document.body.appendChild(input)
  updateInputBounds()
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
  canvas.setDirty(true, true)
  return true
}

const commitValue = (node: LGraphNode, key: string, next: string): void => {
  const current = node.properties[key]
  if (typeof current === 'object' && current !== null && 'content' in current) {
    node.properties[key] = { ...(current as Record<string, unknown>), content: next }
  } else {
    node.properties[key] = next
  }
  if (typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true, true)
}
