/* eslint-disable immutable/no-mutation */
import {
  ClientPayload,
  handleWsRequest,
  LGraph,
  LiteGraph,
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
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'

import Snackbar from '@/common/SnackBar'
import { AppBar } from '@/components/AppBar'
import Canvas from '@/components/Canvas'
import CircularProgressWithLabel from '@/components/CircularProgressWithLabel'
import TaskView from '@/components/TaskView'
import { getConfig } from '@/utils/config'

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
    Record<string, ServerEventPayload['output']> | undefined
  >(undefined)
  // get search params:
  const searchParams = new URLSearchParams(window.location.search)
  const memoizedOutputs = useMemo(() => outputs, [outputs])

  const path = window.location.pathname
  const [selectedGraph, setSelectedGraph] = useState<string>(path)
  const [maxInputChars, setMaxInputChars] = useState<number>(300)
  const [image, setImage] = useState<string | undefined>()
  const [processingPercentage, setProcessingPercentage] = useState<number>(0)
  const lgraph = useMemo(() => new LiteGraph.LGraph(), [])
  const [socketUrl, setSocketUrl] = useState(
    getConfig().WS + path.slice(1) // window.location.pathname
  )
  const [size, setSize] = useState({
    width: window.outerWidth,
    height: window.outerHeight
  })
  const theme = useTheme()
  const { sendJsonMessage, lastMessage, readyState } = useWebSocket(socketUrl)

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
    sendJsonMessage<ClientPayload>({
      eventName: 'saveGraph',
      payload: {
        graph: lgraph.serialize<SerializedGraph>(),
        name // when no name is given, use the current location.pathname
      }
    })
  }

  useEffect(() => {
    if (lastMessage !== null) {
      const wsEvent: WebSocketEvent<ServerEventPayload> = JSON.parse(lastMessage.data)
      //* Handle events from server
      handleWsRequest<ServerEventPayload>(wsEvent, {
        graphFinished: (payload) => {
          console.log('Graph finished: ', payload)
          setProcessingPercentage(0)
          lgraph.configure(payload)
          lgraph.setDirtyCanvas(true, true)
        },
        question(payload) {
          setQuestion(payload)
        },
        nodeExecuting: (nodeId) => handleNodeExecuting(lgraph, nodeId),
        nodeExecuted: (nodeId) => handleNodeExecuted(lgraph, nodeId),
        graphSaved: () => {
          setSnackbar({
            message: 'Graph saved',
            severity: 'success',
            open: true
          })
        },
        output(output) {
          // check if output is already in outputs, if not add it, otherwise update it
          console.log('Outputs: ', outputs)
          setOutputs((prev) => {
            if (prev === undefined) return { [output.uniqueId]: output }
            return { ...prev, [output.uniqueId]: output }
          })
          console.log('Output: ', output)
        },
        nodeError(payload) {
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
        processingPercentageUpdate(payload) {
          setProcessingPercentage(payload)
        },
        questionImage: function (imageBase64: string): void | Promise<void> {
          setImage(imageBase64)
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
    setOpen(true)
    window.addEventListener('resize', checkSize)
    return () => {
      window.removeEventListener('resize', checkSize)
    }
  }, [lastMessage])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSubmit = useCallback((answer: string) => {
    // TODO: Add type to json
    sendJsonMessage<ClientPayload>({
      eventName: 'runGraph',
      payload: {
        answer: answer,
        user_id: searchParams.get('user_id') ?? undefined,
        timestamp: searchParams.get('timestamp') ?? undefined,
        domain: path.slice(1), // custom_activityname from the LTI launch (LMS settings per activity)
        graph: lgraph.serialize<SerializedGraph>()
      }
    })
  }, [])

  const handleClickChangeSocketUrl = useCallback(() => {
    const newUrl = prompt('Enter new socket url', socketUrl)
    if (newUrl) {
      setSocketUrl(newUrl)
    }
  }, [socketUrl])

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
    sendJsonMessage<ClientPayload>({
      eventName: 'loadGraph',
      payload: workflow
    })
  }

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting...',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Connection closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated'
  }[readyState]
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
