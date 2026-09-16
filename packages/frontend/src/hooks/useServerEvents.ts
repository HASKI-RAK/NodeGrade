import { ServerEventPayload } from '@haski/ta-lib'
import { AlertColor } from '@mui/material'
import { LGraph } from 'litegraph.js'
import { useCallback, useEffect, useState } from 'react'
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
  snackbar: {
    message: string
    severity: AlertColor
    open: boolean
  }
  beginGraphLoad: () => void
  beginAttempt: () => void
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

  const beginAttempt = useCallback(() => {
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

  const handleNodeExecuting = (lgraph: LGraph, nodeId: number) => {
    if (lgraph.getNodeById(nodeId) === null) return
    lgraph.getNodeById(nodeId)!.color = '#88FF00'
    lgraph.setDirtyCanvas(true, true)
  }

  const handleNodeExecuted = (lgraph: LGraph, nodeId: number) => {
    if (lgraph.getNodeById(nodeId) === null) return
    lgraph.getNodeById(nodeId)!.color = '#FFFFFF00'
    lgraph.setDirtyCanvas(true, true)
  }

  useEffect(() => {
    if (!socket) return

    // Define event handlers with their corresponding event types
    const eventHandlers: EventHandlerMap<ServerEventPayload> = {
      graphFinished(payload) {
        console.log('Graph finished: ', payload)
        setProcessingPercentage(100)
        setAttemptState('completed')
        void payload
      },
      questionSet(payload) {
        setQuestion(payload)
      },
      nodeExecuting(nodeId) {
        console.log('Node executing: ', nodeId)
        handleNodeExecuting(lgraph, nodeId)
      },
      nodeExecuted(nodeId) {
        console.log('Node executed: ', nodeId)
        handleNodeExecuted(lgraph, nodeId)
      },
      outputSet(output) {
        // check if output is already in outputs, if not add it, otherwise update it
        console.log('Outputs: ', outputs)
        setOutputs((prev) => {
          if (prev === undefined) return { [output.uniqueId]: output }
          return { ...prev, [output.uniqueId]: output }
        })
        console.log('Output: ', output)
      },
      nodeErrorOccured(payload) {
        console.warn('Node error: ', payload)
        setSnackbar({
          message: payload.error,
          severity: 'error',
          open: true
        })
      },
      maxInputChars(maxChars) {
        setMaxInputChars(maxChars)
      },
      percentageUpdated(payload) {
        setProcessingPercentage(payload)
      },
      questionImageSet: function (imageBase64: string): void | Promise<void> {
        setImage(imageBase64)
      },
      graphOperationFailed(payload) {
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
    snackbar,
    beginGraphLoad,
    beginAttempt,
    failAttempt,
    handleSnackbarClose
  }
}
