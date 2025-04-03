/* eslint-disable immutable/no-mutation */
import {
  ClientPayload,
  handleWsRequest,
  SerializedGraph,
  ServerEventPayload,
  WebSocketEvent
} from '@haski/ta-lib'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import {
  AlertColor,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  styled,
  Typography,
  useTheme
} from '@mui/material'
import { LGraph, LiteGraph } from 'litegraph.js'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Socket } from 'socket.io-client'

import Snackbar from '@/common/SnackBar'
import { AppBar } from '@/components/AppBar'
import Canvas from '@/components/Canvas'
import CircularProgressWithLabel from '@/components/CircularProgressWithLabel'
import TaskView from '@/components/TaskView'
import {
  connectSocket,
  emitEvent,
  getSocket,
  handleEvent,
  handleEvents
} from '@/utils/socket'

export const drawerWidth = 500

const Main = styled('main', { shouldForwardProp: (prop) => prop !== 'open' })<{
  open?: boolean
}>(({ theme, open }) => ({
  flexGrow: 1,
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen
  }),
  marginRight: -drawerWidth,
  ...(open && {
    transition: theme.transitions.create('margin', {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen
    }),
    marginRight: 0
  }),
  /**
   * This is necessary to enable the selection of content. In the DOM, the stacking order is determined
   * by the order of appearance. Following this rule, elements appearing later in the markup will overlay
   * those that appear earlier. Since the Drawer comes after the Main content, this adjustment ensures
   * proper interaction with the underlying content.
   */
  position: 'relative'
}))

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0, 1),
  // necessary for content to be below app bar
  ...theme.mixins.toolbar,
  justifyContent: 'flex-start'
}))

type PayloadEventHandlerDict<T> = {
  [K in keyof T]: (payload: T[K]) => void
}

type EventHandlerArray<T> = [keyof T, (payload: T[keyof T]) => void | Promise<void>][]
type EventHandlerMap<T> = {
  [K in keyof T]: (payload: T[K]) => void | Promise<void>
}

export const Editor = () => {
  const [open, setOpen] = useState(true)
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
  // get search params:
  const searchParams = new URLSearchParams(window.location.search)
  const memoizedOutputs = useMemo(() => outputs, [outputs])

  const path = window.location.pathname
  const [selectedGraph, setSelectedGraph] = useState<string>(path)
  const [maxInputChars, setMaxInputChars] = useState<number>(700)
  const [image, setImage] = useState<string | undefined>()
  const [processingPercentage, setProcessingPercentage] = useState<number>(0)
  const lgraph = useMemo(() => new LiteGraph.LGraph(), [])

  const [socketPath] = useState(path.slice(1)) // window.location.pathname without leading slash
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('Connecting...')

  const [size, setSize] = useState({
    width: window.outerWidth,
    height: window.outerHeight
  })
  const theme = useTheme()

  const checkSize = useCallback(() => {
    setSize({
      width: window.outerWidth,
      height: window.outerWidth
    })
  }, [open])

  const handleDrawerOpen = () => {
    setOpen(true)
  }

  const handleDrawerClose = () => {
    setOpen(false)
  }

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

  const handleSaveGraph = () => {
    // prompt user
    const name = prompt('Enter graph name', path)
    if (!name) return
    emitEvent('saveGraph', {
      graph: lgraph.serialize<SerializedGraph>(),
      name // when no name is given, use the current location.pathname
    })
  }

  const handlePublishGraph = () => {
    //name based on the current location.pathname, just exchange editor with student
    const name = path.replace('editor', 'student')
    emitEvent('saveGraph', {
      graph: lgraph.serialize<SerializedGraph>(),
      name
    })
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

    // Set up connection event listeners
    socketInstance.on('connect', onConnect)
    socketInstance.on('disconnect', onDisconnect)
    socketInstance.on('connect_error', onConnectError)

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
    for (const [eventName, handler] of Object.entries(
      eventHandlers
    ) as EventHandlerArray<ServerEventPayload>) {
      socketInstance.on(eventName, (payload) => {
        if (handler) {
          handler(payload)
        } else {
          console.error(`No handler for event: ${eventName}`)
        }
      })
    }

    // Connect to the socket server
    connectSocket()

    setOpen(true)
    window.addEventListener('resize', checkSize)

    // Cleanup function
    return () => {
      window.removeEventListener('resize', checkSize)

      //TODO: Remove all event listeners
      socketInstance.off('connect', onConnect)
      socketInstance.off('disconnect', onDisconnect)
      socketInstance.off('connect_error', onConnectError)
    }
  }, [socketPath])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSubmit = useCallback(
    (answer: string) => {
      // TODO: Add type to json
      if (socket && socket.connected) {
        emitEvent('runGraph', {
          answer: answer,
          user_id: searchParams.get('user_id') ?? undefined,
          timestamp: searchParams.get('timestamp') ?? undefined,
          domain: path.slice(1), // custom_activityname from the LTI launch (LMS settings per activity)
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
    },
    [socket, searchParams]
  )

  const handleClickChangeSocketUrl = useCallback(() => {
    const newUrl = prompt('Enter new socket path', socketPath)
    if (newUrl) {
      window.location.href = '/editor/' + newUrl
    }
  }, [socketPath])

  const handleDownloadGraph = () => {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(lgraph.serialize())
    )}`
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.setAttribute('href', dataStr)
    downloadAnchorNode.setAttribute('download', 'graph.json')
    document.body.appendChild(downloadAnchorNode) // required for firefox
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  const handleUploadGraph = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const contents = e.target?.result
          if (typeof contents === 'string') {
            lgraph.configure(JSON.parse(contents))
            lgraph.setDirtyCanvas(true, true)
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  /**
   * Loads a new workflow from the server. Does not save the current graph nor does it run it.
   * @param workflow - the ID of the workflow to load
   */
  const handleWorkflowChange = (workflow: string) => {
    setSelectedGraph(workflow)
    if (socket && socket.connected) {
      emitEvent('loadGraph', workflow)
    } else {
      console.error('Socket not connected')
      setSnackbar({
        message: 'Connection to server lost. Please refresh the page.',
        severity: 'error',
        open: true
      })
    }
  }

  return (
    <>
      <Box sx={{ display: 'flex' }}>
        <AppBar
          open={open}
          currentPath={selectedGraph}
          handleClickChangeSocketUrl={handleClickChangeSocketUrl}
          handleSaveGraph={handleSaveGraph}
          handleDrawerOpen={handleDrawerOpen}
          handleDownloadGraph={handleDownloadGraph}
          handleUploadGraph={handleUploadGraph}
          handleWorkflowChange={handleWorkflowChange}
          handlePublishGraph={handlePublishGraph}
        />
        <Main open={open}>
          <Button
            onClick={handleDrawerOpen}
            variant="contained"
            startIcon={
              <ArrowBackIosNewIcon
                sx={{
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: (theme) =>
                    theme.transitions.create('transform', {
                      duration: theme.transitions.duration.shortest
                    })
                }}
              />
            }
            style={{ position: 'absolute', top: 0, right: 0 }}
          >
            {open ? 'Close' : 'Open'}
          </Button>
          <Canvas lgraph={lgraph} width={size.width} height={size.height} />
        </Main>
        {/* WS connection indicator status */}
        <Typography
          variant="body1"
          sx={{
            position: 'absolute',
            bottom: 0,
            padding: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            color: 'white',
            marginRight: drawerWidth
          }}
        >
          {connectionStatus}
        </Typography>
        <Drawer
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth
            }
          }}
          variant="persistent"
          anchor="right"
          open={open}
        >
          <DrawerHeader>
            <IconButton onClick={handleDrawerClose}>
              {theme.direction === 'rtl' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </IconButton>
            <Typography variant="h6" noWrap component="div">
              Task preview
            </Typography>
          </DrawerHeader>
          <Divider />
          {processingPercentage > 0 && processingPercentage < 100 && (
            <CircularProgressWithLabel value={processingPercentage} />
          )}
          <TaskView
            question={question}
            questionImage={image}
            onSubmit={handleSubmit}
            outputs={memoizedOutputs}
            maxInputChars={maxInputChars}
          />
        </Drawer>
      </Box>
      <Snackbar
        open={snackbar.open}
        handleClose={handleSnackbarClose}
        message={snackbar.message}
        severity={snackbar.severity}
      />
    </>
  )
}

export default memo(Editor)
