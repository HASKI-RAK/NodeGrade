import { LGraph, LiteGraph } from '@haski/ta-lib'
import type { LGraphCanvas } from 'litegraph.js'
import type { Socket } from 'socket.io-client'

import type { SaveStatus } from '@/hooks/useAutosave'

type DebugEvent = { name: string; payload: unknown; timestamp: string }
type DebugNode = {
  id: number
  title: string
  type: string | null
  pos: [number, number]
  size: [number, number]
  properties: unknown
}

export type NodeGradeDebugBridge = {
  readonly version: 2
  graphSnapshot(): unknown
  listNodes(): DebugNode[]
  getNode(id: number): DebugNode | undefined
  selectNode(id: number): boolean
  selectedNodeIds(): number[]
  addNode(type: string, position?: [number, number]): DebugNode
  connectNodes(
    sourceId: number,
    sourceSlot: number | string,
    targetId: number,
    targetSlot: number | string
  ): boolean
  setNodeProperty(id: number, property: string, value: unknown): boolean
  socketState(): { connected: boolean; id?: string }
  workspaceState(): { workspaceId?: string; workflowId?: string; type?: string }
  saveStatus(): SaveStatus
  saveNow(): Promise<SaveStatus>
  recentEvents(): DebugEvent[]
  clearEvents(): void
  waitForEvent(eventName: string, timeoutMs?: number): Promise<unknown>
  runGraph(answer?: string): boolean
}

const enabled = import.meta.env.DEV && import.meta.env.VITE_DEBUG_BRIDGE === 'true'
const events: DebugEvent[] = []
let debugSocket: Socket | undefined
let eventListener: ((eventName: string, ...args: unknown[]) => void) | undefined
let session: {
  workspaceId?: string
  workflowId?: string
  type?: string
  status: () => SaveStatus
  save: () => Promise<SaveStatus>
} = {
  workspaceId: undefined as string | undefined,
  workflowId: undefined as string | undefined,
  type: undefined as string | undefined,
  status: (() => 'loading') as () => SaveStatus,
  save: (async () => 'loading') as () => Promise<SaveStatus>
}

const safe = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(
    JSON.stringify(value, (key, item) =>
      /(authorization|api[-_]?key|password|secret|token)/i.test(key) ? '[redacted]' : item
    )
  ) as unknown
}

export function configureDebugSession(next: {
  workspaceId?: string
  workflowId?: string
  type?: string
  status: () => SaveStatus
  save: () => Promise<SaveStatus>
}) {
  session = next
}

export function attachDebugSocket(socket: Socket) {
  if (!enabled) return
  debugSocket = socket
  eventListener = (name, payload) => {
    events.push({ name, payload: safe(payload), timestamp: new Date().toISOString() })
    if (events.length > 200) events.shift()
  }
  socket.onAny(eventListener)
}

export function detachDebugSocket(socket: Socket) {
  if (eventListener) socket.offAny(eventListener)
  debugSocket = undefined
  eventListener = undefined
}

export function installDebugBridge(graph: LGraph, canvas: LGraphCanvas) {
  if (!enabled) return
  const nodes = (): DebugNode[] =>
    graph.serialize().nodes.map((node) => ({
      id: node.id,
      title: graph.getNodeById(node.id)?.title ?? '',
      type: node.type,
      pos: Array.from(node.pos).slice(0, 2) as [number, number],
      size: Array.from(node.size).slice(0, 2) as [number, number],
      properties: safe(node.properties)
    }))
  const waitForEvent = (name: string, timeoutMs = 5000) =>
    new Promise<unknown>((resolve, reject) => {
      const started = Date.now()
      const timer = window.setInterval(() => {
        const event = events.findLast((candidate) => candidate.name === name)
        if (event) {
          window.clearInterval(timer)
          resolve(event.payload)
        } else if (Date.now() - started >= timeoutMs) {
          window.clearInterval(timer)
          reject(new Error(`Timed out waiting for ${name}`))
        }
      }, 25)
    })
  window.__NODEGRADE_DEBUG__ = {
    version: 2,
    graphSnapshot: () => safe(graph.serialize()),
    listNodes: nodes,
    getNode: (id) => nodes().find((node) => node.id === id),
    selectNode(id) {
      const node = graph.getNodeById(id)
      if (!node) return false
      canvas.selectNode(node)
      canvas.centerOnNode(node)
      return true
    },
    selectedNodeIds: () => Object.keys(canvas.selected_nodes).map(Number),
    addNode(type, position = [100, 100]) {
      const node = LiteGraph.createNode(type)
      node.pos = position
      graph.add(node)
      return nodes().find((candidate) => candidate.id === node.id) as DebugNode
    },
    connectNodes(sourceId, sourceSlot, targetId, targetSlot) {
      const source = graph.getNodeById(sourceId)
      const target = graph.getNodeById(targetId)
      if (!source || !target) return false
      source.connect(sourceSlot, target, targetSlot)
      return true
    },
    setNodeProperty(id, property, value) {
      const node = graph.getNodeById(id)
      if (!node) return false
      node.properties[property] = value
      graph.setDirtyCanvas(true, true)
      return true
    },
    socketState: () => ({
      connected: debugSocket?.connected ?? false,
      id: debugSocket?.id
    }),
    workspaceState: () => ({
      workspaceId: session.workspaceId,
      workflowId: session.workflowId,
      type: session.type
    }),
    saveStatus: () => session.status(),
    saveNow: () => session.save(),
    recentEvents: () => [...events],
    clearEvents: () => events.splice(0, events.length),
    waitForEvent,
    runGraph(answer = 'Deterministic debug answer') {
      if (!debugSocket || !session.workflowId) return false
      debugSocket.emit('runGraph', {
        workflowId: session.workflowId,
        answer,
        graph: JSON.stringify(graph.serialize())
      })
      return true
    }
  }
}

declare global {
  interface Window {
    __NODEGRADE_DEBUG__?: NodeGradeDebugBridge
  }
}
