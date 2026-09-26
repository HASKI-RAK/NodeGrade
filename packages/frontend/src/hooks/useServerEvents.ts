import { ServerEventPayload, Watch, WATCH_DETAIL_NAME } from '@haski/ta-lib'
import { AlertColor } from '@mui/material'
import { LGraph, type LGraphNode } from 'litegraph.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'

const RUNNING_COLOR = '#88FF00'
const FAILED_COLOR = '#ff0000'
const IDLE_COLOR = '#FFFFFF00'

type EventHandlerArray<T> = [keyof T, (payload: T[keyof T]) => void | Promise<void>][]
type EventHandlerMap<T> = {
  [K in keyof T]: (payload: T[K]) => void | Promise<void>
}

interface UseServerEventsOptions {
  socket: Socket | null
  lgraph: LGraph
}

export type GraphState = 'idle' | 'loading' | 'ready' | 'not-found' | 'failed'
export type AttemptState = 'idle' | 'running' | 'completed' | 'failed'

export interface UseServerEventsResult {
  outputs: Record<string, ServerEventPayload['outputSet']> | undefined
  question: string
  image: string | undefined
  /** Undefined until a run emits one: the preview has no maximum of its own (FR-008). */
  maxInputChars: number | undefined
  processingPercentage: number
  graphState: GraphState
  attemptState: AttemptState
  failureMessage: string | undefined
  runId: string | undefined
  runState: ServerEventPayload['runStateChanged']['state'] | undefined
  trace: ServerEventPayload['nodeExecutionChanged'][]
  snackbar: {
    message: string
    severity: AlertColor
    open: boolean
  }
  /** A run was refused because the participant's workshop has ended (SPEC-0022/FR-012). */
  workshopClosed: boolean
  beginGraphLoad: () => void
  beginAttempt: (requestId?: string) => void
  failAttempt: (message: string) => void
  /**
   * Locally abandon the in-flight attempt (queued or running). Late server events
   * for the abandoned request are ignored; when the server belatedly assigns a
   * run id to an abandoned queued request it is exposed as cancelledRunId so the
   * caller can still send cancelRun and free the workspace slot.
   */
  cancelAttempt: (message: string) => void
  cancelledRunId: string | undefined
  acknowledgeCancelledRun: () => void
  handleSnackbarClose: (event: React.SyntheticEvent | Event, reason?: string) => void
}

export function useServerEvents({
  socket,
  lgraph
}: UseServerEventsOptions): UseServerEventsResult {
  const [question, setQuestion] = useState<string>('')
  const [outputs, setOutputs] = useState<
    Record<string, ServerEventPayload['outputSet']> | undefined
  >(undefined)
  const [maxInputChars, setMaxInputChars] = useState<number | undefined>(undefined)
  const [image, setImage] = useState<string | undefined>()
  const [workshopClosed, setWorkshopClosed] = useState(false)
  const [processingPercentage, setProcessingPercentage] = useState<number>(0)
  const [graphState, setGraphState] = useState<GraphState>('idle')
  const [attemptState, setAttemptState] = useState<AttemptState>('idle')
  const [failureMessage, setFailureMessage] = useState<string>()
  const [runId, setRunId] = useState<string>()
  const [runState, setRunState] =
    useState<ServerEventPayload['runStateChanged']['state']>()
  const [trace, setTrace] = useState<ServerEventPayload['nodeExecutionChanged'][]>([])
  const requestIdRef = useRef<string | undefined>(undefined)
  const runIdRef = useRef<string | undefined>(undefined)
  const cancelledRequestRef = useRef<string | undefined>(undefined)
  const [cancelledRunId, setCancelledRunId] = useState<string | undefined>(undefined)
  const [snackbar, setSnackbar] = useState<{
    message: string
    severity: AlertColor
    open: boolean
  }>({
    message: '',
    severity: 'success',
    open: false
  })

  const handleSnackbarClose = (event: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return
    }
    setSnackbar((current) => ({ ...current, open: false }))
  }

  const beginGraphLoad = useCallback(() => {
    setGraphState('loading')
    setAttemptState('idle')
    setFailureMessage(undefined)
    setOutputs(undefined)
    setQuestion('')
    setImage(undefined)
    setProcessingPercentage(0)
  }, [])

  /**
   * Every node this hook ever paints (green while running, red on failure).
   * Clearing on a new attempt guarantees no stale highlight survives the run
   * that set it, even if that run's terminal event was lost.
   */
  const highlightedRef = useRef<Set<LGraphNode>>(new Set())
  /** Subset of highlightedRef currently shown as running (green). At most one step. */
  const runningRef = useRef<LGraphNode[]>([])

  const paintNodes = useCallback(
    (nodes: LGraphNode[], color: string) => {
      if (nodes.length === 0) return
      for (const node of nodes) {
        node.color = color
        if (color === IDLE_COLOR) highlightedRef.current.delete(node)
        else highlightedRef.current.add(node)
      }
      lgraph.setDirtyCanvas(true, true)
    },
    [lgraph]
  )

  const clearRunningNodes = useCallback(() => {
    paintNodes(runningRef.current, IDLE_COLOR)
    runningRef.current = []
  }, [paintNodes])

  const clearAllHighlights = useCallback(() => {
    paintNodes([...highlightedRef.current], IDLE_COLOR)
    highlightedRef.current.clear()
    runningRef.current = []
  }, [paintNodes])

  /** Watch nodes showing a value from the current attempt. */
  const watchedRef = useRef<Set<Watch>>(new Set())

  /** A new attempt starts blank, so a watch the run skips cannot show a stale value. */
  const clearWatchedValues = useCallback(() => {
    for (const node of watchedRef.current) node.clearValue()
    watchedRef.current.clear()
  }, [])

  const beginAttempt = useCallback(
    (requestId?: string) => {
      requestIdRef.current = requestId
      runIdRef.current = undefined
      cancelledRequestRef.current = undefined
      setCancelledRunId(undefined)
      setRunId(undefined)
      setRunState('queued')
      setTrace([])
      setAttemptState('running')
      setFailureMessage(undefined)
      setOutputs(undefined)
      setProcessingPercentage(0)
      clearAllHighlights()
      clearWatchedValues()
    },
    [clearAllHighlights, clearWatchedValues]
  )

  const failAttempt = useCallback(
    (message: string) => {
      setAttemptState('failed')
      setFailureMessage(message)
      setProcessingPercentage(0)
      setSnackbar({ message, severity: 'error', open: true })
      clearRunningNodes()
    },
    [clearRunningNodes]
  )

  const cancelAttempt = useCallback(
    (message: string) => {
      cancelledRequestRef.current = requestIdRef.current
      requestIdRef.current = undefined
      runIdRef.current = undefined
      setRunId(undefined)
      setRunState('cancelled')
      setAttemptState('failed')
      setFailureMessage(message)
      setProcessingPercentage(0)
      setSnackbar({ message, severity: 'info', open: true })
      clearRunningNodes()
    },
    [clearRunningNodes]
  )

  const acknowledgeCancelledRun = useCallback(() => {
    cancelledRequestRef.current = undefined
    setCancelledRunId(undefined)
  }, [])

  /**
   * The server executes a compiled flat graph whose ids are renumbered from 1,
   * so `payload.nodeId` is a compiled execution id that must never address the
   * editor graph directly. `sourceId` (plus `wrapperId` for block-internal
   * nodes) is the editor identity — the same resolution `selectTraceNode` uses.
   */
  const resolveEditorNodes = useCallback(
    (payload: ServerEventPayload['nodeExecutionChanged']): LGraphNode[] => {
      if (payload.wrapperId != null && payload.sourceId != null) {
        const wrapper = lgraph.getNodeById(payload.wrapperId)
        if (wrapper && wrapper.type === 'graph/subgraph' && 'subgraph' in wrapper) {
          const inner = (wrapper.subgraph as LGraph).getNodeById(payload.sourceId)
          // Paint both so the highlight is visible whether the block is open
          // (inner node) or closed (wrapper node).
          return [wrapper, ...(inner ? [inner] : [])]
        }
        if (wrapper) return [wrapper]
      }
      if (payload.sourceId != null) {
        const node = lgraph.getNodeById(payload.sourceId)
        if (node) return [node]
      }
      // Backwards compatibility for payloads without editor identity.
      const fallback = lgraph.getNodeById(payload.nodeId)
      return fallback ? [fallback] : []
    },
    [lgraph]
  )

  const colorNode = useCallback(
    (payload: ServerEventPayload['nodeExecutionChanged']) => {
      const nodes = resolveEditorNodes(payload)
      if (nodes.length === 0) return
      if (payload.state === 'running') {
        // Exactly one node runs at a time (sequential topological execution):
        // clear the previous green before painting the new one so a lost
        // terminal event can never leave two greens on canvas.
        const previous = runningRef.current.filter((node) => !nodes.includes(node))
        paintNodes(previous, IDLE_COLOR)
        paintNodes(nodes, RUNNING_COLOR)
        runningRef.current = nodes
        return
      }
      paintNodes(nodes, payload.state === 'failed' ? FAILED_COLOR : IDLE_COLOR)
      if (runningRef.current.some((node) => nodes.includes(node))) {
        runningRef.current = runningRef.current.filter((node) => !nodes.includes(node))
      }
    },
    [paintNodes, resolveEditorNodes]
  )

  /**
   * The graph runs on the server, so a watch node in the editor never executes:
   * its value arrives as the trace row the server-side watch recorded.
   */
  const showWatchedValue = useCallback(
    (payload: ServerEventPayload['nodeExecutionChanged']) => {
      if (payload.state !== 'completed' || payload.nodeType !== Watch.getPath()) return
      const row = payload.outputs?.find((output) => output.name === WATCH_DETAIL_NAME)
      if (!row) return
      for (const node of resolveEditorNodes(payload)) {
        if (!(node instanceof Watch)) continue
        node.showValue({ type: row.type, value: row.value, truncated: row.truncated })
        watchedRef.current.add(node)
      }
      lgraph.setDirtyCanvas(true, true)
    },
    [lgraph, resolveEditorNodes]
  )

  useEffect(() => {
    if (!socket) return

    // Define event handlers with their corresponding event types
    const eventHandlers: EventHandlerMap<ServerEventPayload> = {
      graphFinished(payload) {
        if (payload.runId !== runIdRef.current) return
        console.log('Graph finished: ', payload)
        setProcessingPercentage(100)
        setAttemptState('completed')
        clearRunningNodes()
        void payload
      },
      questionSet(payload) {
        setQuestion(payload)
      },
      runStateChanged(payload) {
        // A locally cancelled attempt ignores further UI updates, but a queued
        // request the server accepts late still occupies a workspace run slot:
        // capture its run id so the caller can send cancelRun for it.
        if (
          payload.requestId !== undefined &&
          payload.requestId === cancelledRequestRef.current
        ) {
          if (payload.runId !== undefined) setCancelledRunId(payload.runId)
          return
        }
        // Correlate on the request id whenever it is still the attempt in flight: a run
        // the server refuses outright reports a terminal state without ever queueing.
        if (payload.requestId === requestIdRef.current) {
          runIdRef.current = payload.runId
          setRunId(payload.runId)
        } else if (payload.runId !== runIdRef.current) return
        setRunState(payload.state)
        if (payload.state === 'completed') {
          setAttemptState('completed')
          clearRunningNodes()
        }
        if (payload.state === 'failed' || payload.state === 'cancelled') {
          setAttemptState('failed')
          setFailureMessage(payload.error?.message)
          clearRunningNodes()
        }
      },
      nodeExecutionChanged(payload) {
        if (payload.runId !== runIdRef.current) return
        setTrace((current) => {
          const index = current.findIndex((step) => step.nodeId === payload.nodeId)
          if (index < 0) return [...current, payload]
          return current.map((step, stepIndex) => (stepIndex === index ? payload : step))
        })
        colorNode(payload)
        showWatchedValue(payload)
      },
      outputSet(output) {
        if (output.runId !== runIdRef.current) return
        // check if output is already in outputs, if not add it, otherwise update it
        console.log('Outputs: ', outputs)
        setOutputs((prev) => {
          if (prev === undefined) return { [output.uniqueId]: output }
          return { ...prev, [output.uniqueId]: output }
        })
        console.log('Output: ', output)
      },
      maxInputChars(maxChars) {
        setMaxInputChars(maxChars)
      },
      percentageUpdated(payload) {
        if (payload.runId !== runIdRef.current) return
        setProcessingPercentage(payload.percentage)
      },
      questionImageSet: function (imageBase64: string): void | Promise<void> {
        setImage(imageBase64)
      },
      graphOperationFailed(payload) {
        if (payload.operation === 'run' && payload.runId !== runIdRef.current) return
        if (payload.code === 'workshop-closed') setWorkshopClosed(true)
        setFailureMessage(payload.message)
        if (payload.operation === 'load') {
          setGraphState(payload.code === 'not-found' ? 'not-found' : 'failed')
        } else {
          setAttemptState('failed')
          setProcessingPercentage(0)
        }
        setSnackbar({
          message: payload.message,
          severity: 'error',
          open: true
        })
      }
    }

    // For each event handler, set up the event listener
    const eventEntries = Object.entries(
      eventHandlers
    ) as EventHandlerArray<ServerEventPayload>

    for (const [eventName, handler] of eventEntries) {
      socket.on(eventName, handler)
    }

    // Cleanup function
    return () => {
      // Remove all payload event listeners
      for (const [eventName, handler] of eventEntries) {
        socket.off(eventName, handler)
      }
    }
  }, [socket, lgraph, colorNode, clearRunningNodes, showWatchedValue])

  return {
    outputs,
    question,
    image,
    maxInputChars,
    processingPercentage,
    graphState,
    attemptState,
    failureMessage,
    runId,
    runState,
    trace,
    snackbar,
    workshopClosed,
    beginGraphLoad,
    beginAttempt,
    failAttempt,
    cancelAttempt,
    cancelledRunId,
    acknowledgeCancelledRun,
    handleSnackbarClose
  }
}
