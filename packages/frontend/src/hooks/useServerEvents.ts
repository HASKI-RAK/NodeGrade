import { ServerEventPayload } from '@haski/ta-lib'
import { AlertColor } from '@mui/material'
import { LGraph } from 'litegraph.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'

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
  maxInputChars: number
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
  beginGraphLoad: () => void
  beginAttempt: (requestId?: string) => void
  failAttempt: (message: string) => void
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
  const [maxInputChars, setMaxInputChars] = useState<number>(700)
  const [image, setImage] = useState<string | undefined>()
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

  const beginAttempt = useCallback((requestId?: string) => {
    requestIdRef.current = requestId
    runIdRef.current = undefined
    setRunId(undefined)
    setRunState('queued')
    setTrace([])
    setAttemptState('running')
    setFailureMessage(undefined)
    setOutputs(undefined)
    setProcessingPercentage(0)
  }, [])

  const failAttempt = useCallback((message: string) => {
    setAttemptState('failed')
    setFailureMessage(message)
    setProcessingPercentage(0)
    setSnackbar({ message, severity: 'error', open: true })
  }, [])

  const colorNode = (nodeId: number, state: string) => {
    const node = lgraph.getNodeById(nodeId)
    if (!node) return
    node.color =
      state === 'running' ? '#88FF00' : state === 'failed' ? '#ff0000' : '#FFFFFF00'
    lgraph.setDirtyCanvas(true, true)
  }

  useEffect(() => {
    if (!socket) return

    // Define event handlers with their corresponding event types
    const eventHandlers: EventHandlerMap<ServerEventPayload> = {
      graphFinished(payload) {
        if (payload.runId !== runIdRef.current) return
        console.log('Graph finished: ', payload)
        setProcessingPercentage(100)
        setAttemptState('completed')
        void payload
      },
      questionSet(payload) {
        setQuestion(payload)
      },
      runStateChanged(payload) {
        if (payload.state === 'queued') {
          if (payload.requestId !== requestIdRef.current) return
          runIdRef.current = payload.runId
          setRunId(payload.runId)
        } else if (payload.runId !== runIdRef.current) return
        setRunState(payload.state)
        if (payload.state === 'completed') setAttemptState('completed')
        if (payload.state === 'failed' || payload.state === 'cancelled') {
          setAttemptState('failed')
          setFailureMessage(payload.error?.message)
        }
      },
      nodeExecutionChanged(payload) {
        if (payload.runId !== runIdRef.current) return
        setTrace((current) => {
          const index = current.findIndex((step) => step.nodeId === payload.nodeId)
          if (index < 0) return [...current, payload]
          return current.map((step, stepIndex) => (stepIndex === index ? payload : step))
        })
        colorNode(payload.nodeId, payload.state)
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
  }, [socket, lgraph])

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
    beginGraphLoad,
    beginAttempt,
    failAttempt,
    handleSnackbarClose
  }
}
