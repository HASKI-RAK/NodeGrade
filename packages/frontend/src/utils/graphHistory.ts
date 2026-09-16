import type { LGraph } from 'litegraph.js'

export type GraphSnapshot = {
  content: string
  selection: number[]
}

export type HistoryEntry = {
  before: GraphSnapshot
  after: GraphSnapshot
  bytes: number
}

type HistoryState = {
  canUndo: boolean
  canRedo: boolean
}

const MAX_ENTRIES = 50
const MAX_BYTES = 25 * 1024 * 1024
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength

export class GraphHistory {
  private undoEntries: HistoryEntry[] = []
  private redoEntries: HistoryEntry[] = []
  private before: GraphSnapshot | null = null
  private depth = 0
  private restoring = false
  private listeners = new Set<() => void>()
  private state: HistoryState = { canUndo: false, canRedo: false }

  constructor(
    private readonly graph: LGraph,
    private readonly getSelection: () => number[],
    private readonly restoreSelection: (ids: number[]) => void,
    private readonly afterRestore?: () => void
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): HistoryState => this.state

  begin = (): void => {
    if (this.restoring) return
    if (this.depth === 0) this.before = this.snapshot()
    this.depth += 1
  }

  end = (): void => {
    if (this.restoring || this.depth === 0) return
    this.depth -= 1
    if (this.depth > 0 || !this.before) return
    const after = this.snapshot()
    if (after.content !== this.before.content) {
      const entry = {
        before: this.before,
        after,
        bytes: byteLength(this.before.content) + byteLength(after.content)
      }
      this.undoEntries.push(entry)
      this.redoEntries = []
      this.evict()
      this.emit()
    }
    this.before = null
  }

  transact = (mutation: () => void): void => {
    this.begin()
    try {
      mutation()
    } finally {
      this.end()
    }
  }

  undo = (): void => {
    const entry = this.undoEntries.pop()
    if (!entry) return
    this.restore(entry.before)
    this.redoEntries.push(entry)
    this.emit()
  }

  redo = (): void => {
    const entry = this.redoEntries.pop()
    if (!entry) return
    this.restore(entry.after)
    this.undoEntries.push(entry)
    this.emit()
  }

  clear = (): void => {
    this.before = null
    this.depth = 0
    this.undoEntries = []
    this.redoEntries = []
    this.emit()
  }

  private snapshot(): GraphSnapshot {
    return {
      content: JSON.stringify(this.graph.serialize()),
      selection: this.getSelection()
    }
  }

  private restore(snapshot: GraphSnapshot): void {
    this.restoring = true
    try {
      this.graph.configure(JSON.parse(snapshot.content))
      this.restoreSelection(snapshot.selection)
      this.afterRestore?.()
      this.graph.setDirtyCanvas(true, true)
    } finally {
      this.restoring = false
    }
  }

  private evict(): void {
    let bytes = this.undoEntries.reduce((sum, entry) => sum + entry.bytes, 0)
    while (this.undoEntries.length > MAX_ENTRIES || bytes > MAX_BYTES) {
      const removed = this.undoEntries.shift()
      if (removed) bytes -= removed.bytes
    }
  }

  private emit(): void {
    this.state = {
      canUndo: this.undoEntries.length > 0,
      canRedo: this.redoEntries.length > 0
    }
    this.listeners.forEach((listener) => listener())
  }
}

export const isFormControl = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
  )
}
