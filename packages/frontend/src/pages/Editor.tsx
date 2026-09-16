import { LiteGraph } from '@haski/ta-lib'
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { api, type Workflow } from '@/api/http'
import Canvas from '@/components/Canvas'
import TaskView from '@/components/TaskView'
import { useAutosave } from '@/hooks/useAutosave'
import { useEditorUI } from '@/hooks/useEditorUI'
import { useServerEvents } from '@/hooks/useServerEvents'
import { useSocket } from '@/hooks/useSocket'
import { workspaceStore } from '@/store/workspaceStore'
import { configureDebugSession } from '@/utils/debugBridge'

const statusLabel = {
  loading: 'Loading…',
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  conflict: 'Save conflict — reload required',
  error: 'Save failed'
} as const

export const drawerWidth = 400

export const Editor = () => {
  const { workflowId = '' } = useParams()
  const [search] = useSearchParams()
  const ltiMode =
    search.get('lti') === '1' || window.location.pathname.startsWith('/student/')
  const session = ltiMode ? null : workspaceStore.active()
  const token = session?.token ?? null
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lgraph = useMemo(() => new LiteGraph.LGraph(), [])
  const { size } = useEditorUI({ initialDrawerState: false })

  useEffect(() => {
    let active = true
    void api
      .workflow(workflowId, token)
      .then(({ workflow: loaded }) => {
        lgraph.configure(JSON.parse(loaded.content ?? '{}'))
        lgraph.setDirtyCanvas(true, true)
        if (active) setWorkflow(loaded)
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(
            error instanceof Error ? error.message : 'Workflow could not be loaded.'
          )
      })
    return () => {
      active = false
    }
  }, [lgraph, token, workflowId])

  const autosave = useAutosave({
    graph: lgraph,
    workflowId,
    token,
    initialVersion: workflow?.version ?? 1,
    enabled: workflow !== null && !window.location.pathname.startsWith('/student/')
  })
  const { socket, connectionStatus, runGraph } = useSocket({
    workflowId,
    workspaceToken: token,
    lgraph
  })
  const { outputs, question, image, maxInputChars, processingPercentage } =
    useServerEvents({
      socket,
      lgraph
    })

  useEffect(() => {
    configureDebugSession({
      workspaceId: session?.id,
      workflowId,
      type: session?.type ?? (ltiMode ? 'LTI' : undefined),
      status: () => autosave.status,
      save: autosave.saveNow
    })
  }, [autosave.saveNow, autosave.status, ltiMode, session?.id, session?.type, workflowId])

  const submit = useCallback((answer: string) => runGraph({ answer }), [runGraph])

  if (loadError) {
    return (
      <Box p={4}>
        <Typography color="error">{loadError}</Typography>
        <Button component={Link} to="/">
          Back to start
        </Button>
      </Box>
    )
  }
  if (!workflow)
    return (
      <Box p={4}>
        <CircularProgress />
      </Box>
    )

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7fb' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        px={2}
        py={1}
        bgcolor="white"
      >
        <Button component={Link} to="/">
          Start
        </Button>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {workflow.name}
        </Typography>
        {session?.type === 'WORKSHOP' && (
          <Chip label={session.label ?? 'Workshop'} color="primary" />
        )}
        <Chip
          label={statusLabel[autosave.status]}
          color={
            autosave.status === 'conflict' || autosave.status === 'error'
              ? 'error'
              : 'default'
          }
        />
        <Chip label={connectionStatus} variant="outlined" />
        {!window.location.pathname.startsWith('/student/') && (
          <Button onClick={() => void autosave.saveNow()}>Save now</Button>
        )}
        {ltiMode && !window.location.pathname.startsWith('/student/') && (
          <Button onClick={() => void api.publishWorkflow(null, workflowId)}>
            Publish
          </Button>
        )}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }}>
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Canvas
            lgraph={lgraph}
            width={Math.max(600, size.width - 420)}
            height={Math.max(500, size.height - 72)}
          />
        </Box>
        <Box sx={{ width: { xs: '100%', md: 400 }, p: 2, bgcolor: 'white' }}>
          {processingPercentage > 0 && processingPercentage < 100 && (
            <Typography>Running: {processingPercentage}%</Typography>
          )}
          <TaskView
            question={question}
            questionImage={image}
            onSubmit={submit}
            outputs={outputs}
            maxInputChars={maxInputChars}
          />
        </Box>
      </Stack>
    </Box>
  )
}

export default Editor
