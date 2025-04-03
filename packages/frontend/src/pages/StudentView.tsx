import {
  ClientPayload,
  handleWsRequest,
  LiteGraph,
  SerializedGraph,
  ServerEventPayload,
  WebSocketEvent
} from '@haski/ta-lib'
import { AlertColor, Backdrop, Box, Container, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Socket } from 'socket.io-client'

import Snackbar from '@/common/SnackBar'
import CircularProgressWithLabel from '@/components/CircularProgressWithLabel'
import TaskView from '@/components/TaskView'
import { connectSocket, emitEvent, getSocket } from '@/utils/socket'

export const StudentView = () => {
  const { domain, courseId, elementId } = useParams<{
    domain: string
    courseId: string
    elementId: string
  }>()
  const [snackbar, setSnackbar] = useState<{
    message: string
    severity: AlertColor
    open: boolean
  }>({
    message: '',
    severity: 'success',
    open: false
  })
  const [question, setQuestion] = useState<string>('')
  const [outputs, setOutputs] = useState<
    Record<string, ServerEventPayload['outputSet']> | undefined
  >(undefined)
  const memoizedOutputs = useMemo(() => outputs, [outputs])
  const [image, setImage] = useState<string>('')
  const [maxInputChars, setMaxInputChars] = useState<number>(700)
  const [processingPercentage, setProcessingPercentage] = useState<number>(0)
  const searchParams = new URLSearchParams(window.location.search)
  const lgraph = useMemo(() => new LiteGraph.LGraph(), [])

  const [socketPath] = useState(`ws/student/${domain}/${courseId}/${elementId}`)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('Connecting...')

  const handleSnackbarClose = (event: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return
    }
    setSnackbar({ ...snackbar, open: false })
  }

  // Initialize socket and set up event listeners
  useEffect(() => {
    const socketInstance = getSocket(socketPath)
    setSocket(socketInstance)

    function onConnect() {
      setConnectionStatus('Connected')
    }

    function onDisconnect() {
      setConnectionStatus('Disconnected')
    }

    function onConnectError() {
      setConnectionStatus('Connection error')
    }

    // Set up event handlers to handle server events
    function onEvent(wsEvent: WebSocketEvent<ServerEventPayload>) {
      handleWsRequest<ServerEventPayload>(wsEvent, {
        graphFinished: (payload) => {
          console.log('Graph finished: ', payload)
          setProcessingPercentage(0)
          lgraph.configure(payload)
          lgraph.setDirtyCanvas(true, true)
        },
        questionSet(payload) {
          setQuestion(payload)
        },
        graphSaved: () => {
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
        // We don't have handlers for these events
        nodeExecuting: function (): void | Promise<void> {},
        nodeExecuted: function (): void | Promise<void> {},
        questionImageSet: function (base64Image: string): void | Promise<void> {
          console.log('Image received')
          setImage(base64Image)
        }
      }).then((handled) => {
        if (!handled) {
          setSnackbar({
            message: 'No handler for this event',
            severity: 'error',
            open: true
          })
        }
      })
    }

    // Set up connection event listeners
    socketInstance.on('connect', onConnect)
    socketInstance.on('disconnect', onDisconnect)
    socketInstance.on('connect_error', onConnectError)

    // Set up event listeners for each event type
    const eventTypes: (keyof ServerEventPayload)[] = [
      'graphFinished',
      'questionSet',
      'graphSaved',
      'outputSet',
      'nodeErrorOccured',
      'maxInputChars',
      'percentageUpdated',
      'nodeExecuting',
      'nodeExecuted',
      'questionImageSet'
    ]

    eventTypes.forEach((eventType) => {
      socketInstance.on(eventType, (payload) => {
        const wsEvent = { eventName: eventType, payload }
        onEvent(wsEvent)
      })
    })

    // Connect to the socket server
    connectSocket()

    // Cleanup function
    return () => {
      eventTypes.forEach((eventType) => {
        socketInstance.off(eventType)
      })
      socketInstance.off('connect', onConnect)
      socketInstance.off('disconnect', onDisconnect)
      socketInstance.off('connect_error', onConnectError)
    }
  }, [socketPath])

  const handleSubmit = (answer: string) => {
    if (socket && socket.connected) {
      emitEvent('runGraph', {
        answer: answer,
        user_id: searchParams.get('user_id') ?? undefined,
        timestamp: searchParams.get('timestamp') ?? undefined,
        domain: domain,
        graph: lgraph.serialize<SerializedGraph>()
      })
    } else {
      console.error('Socket not connected')
      setSnackbar({
        message: 'Connection to server lost. Please refresh the page.',
        severity: 'error',
        open: true
      })
    }
  }

  const handleAnswerSubmit = useCallback((answer: string) => {
    handleSubmit(answer)
  }, [])

  return (
    <>
      <Backdrop
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={processingPercentage > 0 && processingPercentage < 100}
      >
        <CircularProgressWithLabel value={processingPercentage} />
      </Backdrop>
      <Container
        style={{
          height: '100vh',
          overflowY: 'scroll'
        }}
      >
        <Typography
          variant="body1"
          sx={{
            position: 'absolute',
            bottom: 0,
            padding: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            color: 'white'
          }}
        >
          {connectionStatus}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          padding={2}
        >
          <TaskView
            question={question}
            questionImage={image}
            onSubmit={handleAnswerSubmit}
            outputs={memoizedOutputs}
            maxInputChars={maxInputChars}
          />
        </Box>
      </Container>
      <Snackbar
        open={snackbar.open}
        handleClose={handleSnackbarClose}
        message={snackbar.message}
        severity={snackbar.severity}
      />
    </>
  )
}

export default StudentView
