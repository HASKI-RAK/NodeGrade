import { ServerEventPayload } from '@haski/ta-lib'
import { AlertColor } from '@mui/material'
import { LGraph } from 'litegraph.js'
import { useEffect, useState } from 'react'
import { Socket } from 'socket.io-client'

type EventHandlerArray<T> = [keyof T, (payload: T[keyof T]) => void | Promise<void>][]
type EventHandlerMap<T> = {
  [K in keyof T]: (payload: T[K]) => void | Promise<void>
}

interface UseServerEventsOptions {
  socket: Socket | null
  lgraph: LGraph
}

export interface UseServerEventsResult {
  outputs: Record<string, ServerEventPayload['outputSet']> | undefined
  question: string
  image: string | undefined
  maxInputChars: number
  processingPercentage: number
  snackbar: {
    message: string
    severity: AlertColor
    open: boolean
  }
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
    setSnackbar({ ...snackbar, open: false })
  }

  const handleNodeExecuting = (lgraph: LGraph, nodeId: number) => {
    if (lgraph.getNodeById(nodeId) === null) return
    // eslint-disable-next-line immutable/no-mutation
    lgraph.getNodeById(nodeId)!.color = '#88FF00'
    lgraph.setDirtyCanvas(true, true)
  }

  const handleNodeExecuted = (lgraph: LGraph, nodeId: number) => {
    if (lgraph.getNodeById(nodeId) === null) return
    // eslint-disable-next-line immutable/no-mutation
    lgraph.getNodeById(nodeId)!.color = '#FFFFFF00'
    lgraph.setDirtyCanvas(true, true)
  }

  useEffect(() => {
    if (!socket) return

    // Define event handlers with their corresponding event types
    const eventHandlers: EventHandlerMap<ServerEventPayload> = {
      graphFinished(payload) {
        console.log('Graph finished: ', payload)
        setProcessingPercentage(0)
        lgraph.configure(payload)
        lgraph.setDirtyCanvas(true, true)
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
      graphSaved(payload) {
        console.log('Graph saved: ', payload)
        setSnackbar({
          message: 'Graph saved',
          severity: 'success',
          open: true
        })
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
      graphLoaded(payload) {
        console.log('Graph loaded: ', payload)
        lgraph.configure(payload)
        lgraph.setDirtyCanvas(true, true)
      }
    }

    // For each event handler, set up the event listener
    const eventEntries = Object.entries(
      eventHandlers
    ) as EventHandlerArray<ServerEventPayload>

    for (const [eventName, handler] of eventEntries) {
      socket.on(eventName, (payload) => {
        if (handler) {
          handler(payload)
        } else {
          console.error(`No handler for event: ${eventName}`)
        }
      })
    }

    // Cleanup function
    return () => {
      // Remove all payload event listeners
      for (const [eventName] of eventEntries) {
        socket.off(eventName.toString())
      }
    }
  }, [socket, lgraph, outputs])

  return {
    outputs,
    question,
    image,
    maxInputChars,
    processingPercentage,
    snackbar,
    handleSnackbarClose
  }
}
