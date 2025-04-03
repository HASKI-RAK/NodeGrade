/* eslint-disable immutable/no-mutation */
import { LiteGraph } from '@haski/ta-lib'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  styled,
  Typography,
  useTheme
} from '@mui/material'
import { memo, useCallback, useMemo } from 'react'

import Snackbar from '@/common/SnackBar'
import { AppBar } from '@/components/AppBar'
import Canvas from '@/components/Canvas'
import CircularProgressWithLabel from '@/components/CircularProgressWithLabel'
import TaskView from '@/components/TaskView'
import { useEditorUI } from '@/hooks/useEditorUI'
import { useGraphOperations } from '@/hooks/useGraphOperations'
import { useServerEvents } from '@/hooks/useServerEvents'
import { useSocket } from '@/hooks/useSocket'
import registerNodes from '@/utils/registernodes'

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
  // Get search params
  const searchParams = new URLSearchParams(window.location.search)
  const path = window.location.pathname

  // Create LiteGraph instance
  const lgraph = useMemo(() => {
    return new (registerNodes(LiteGraph).LGraph)()
  }, [])

  // Use custom hooks
  const {
    open,
    handleDrawerOpen,
    handleDrawerClose,
    size,
    selectedGraph,
    setSelectedGraph
  } = useEditorUI()

  const { socket, connectionStatus, runGraph, loadGraph, saveGraph, publishGraph } =
    useSocket({
      socketPath: path.slice(1), // window.location.pathname without leading slash
      lgraph
    })

  const {
    outputs,
    question,
    image,
    maxInputChars,
    processingPercentage,
    snackbar,
    handleSnackbarClose
  } = useServerEvents({
    socket,
    lgraph
  })

  const { handleDownloadGraph, handleUploadGraph } = useGraphOperations({
    lgraph
  })

  const memoizedOutputs = useMemo(() => outputs, [outputs])

  const handleSubmit = useCallback(
    (answer: string) => {
      try {
        runGraph({
          answer,
          user_id: searchParams.get('user_id') ?? undefined,
          timestamp: searchParams.get('timestamp') ?? undefined,
          domain: path.slice(1) // custom_activityname from the LTI launch
        })
      } catch (error) {
        console.error('Error running graph:', error)
        // The error message is handled in the useSocket hook
      }
    },
    [runGraph, searchParams, path]
  )

  const handleSaveGraph = useCallback(() => {
    // prompt user
    const name = prompt('Enter graph name', path)
    if (!name) return
    saveGraph(name)
  }, [saveGraph, path])

  const handlePublishGraph = useCallback(() => {
    publishGraph(path)
  }, [publishGraph, path])

  const handleClickChangeSocketUrl = useCallback(() => {
    const newUrl = prompt('Enter new socket path', path.slice(1))
    if (newUrl) {
      window.location.href = '/editor/' + newUrl
    }
  }, [path])

  /**
   * Loads a new workflow from the server. Does not save the current graph nor does it run it.
   * @param workflow - the ID of the workflow to load
   */
  const handleWorkflowChange = useCallback(
    (workflow: string) => {
      setSelectedGraph(workflow)
      try {
        loadGraph(workflow)
      } catch (error) {
        console.error('Error loading graph:', error)
        // The error message is handled in the useSocket hook
      }
    },
    [setSelectedGraph, loadGraph]
  )

  const theme = useTheme()

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
