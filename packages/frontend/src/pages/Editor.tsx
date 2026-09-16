import { compactNodeWidgets, LiteGraph, loadLegacyWidgetProperties } from '@haski/ta-lib'
import {
  Alert,
  Box,
  CircularProgress,
  Snackbar,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material'
import type { LGraph, LGraphCanvas, LGraphNode } from 'litegraph.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from 'react-router-dom'

import { api, type Workflow, type WorkflowTemplate } from '@/api/http'
import Canvas from '@/components/Canvas'
import { EditorRail } from '@/components/editor/EditorRail'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { NodeInspector } from '@/components/editor/NodeInspector'
import { NodePalette } from '@/components/editor/NodePalette'
import TaskView, { type TaskViewHandle } from '@/components/TaskView'
import { useAutosave } from '@/hooks/useAutosave'
import { useGraphHistory } from '@/hooks/useGraphHistory'
import { useServerEvents } from '@/hooks/useServerEvents'
import { useSocket } from '@/hooks/useSocket'
import { workspaceStore } from '@/store/workspaceStore'
import { getConfig } from '@/utils/config'
import { configureDebugSession } from '@/utils/debugBridge'
import type { ConnectionSuggestion } from '@/utils/graphBlocks'
import { insertBlock } from '@/utils/graphBlocks'

type SerializedNode = { id: number; widgets_values?: unknown[] }
type SerializedWorkflow = { nodes: SerializedNode[] }

const parseWorkflow = (content: string): SerializedWorkflow & Record<string, unknown> => {
  const parsed: unknown = JSON.parse(content)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('nodes' in parsed) ||
    !Array.isArray(parsed.nodes)
  )
    throw new Error('Workflow JSON must contain a nodes array.')
  if (
    !parsed.nodes.every(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        'id' in node &&
        typeof node.id === 'number'
    )
  )
    throw new Error('Every workflow node must have a numeric ID.')
  return { ...parsed, nodes: parsed.nodes.map((node) => ({ id: node.id, ...node })) }
}

const prepareGraph = (graph: LGraph, serialized: SerializedWorkflow) => {
  serialized.nodes.forEach((source) => {
    const node = graph.getNodeById(source.id)
    if (!node) return
    loadLegacyWidgetProperties(node, source)
    compactNodeWidgets(node)
  })
  graph.setDirtyCanvas(true, true)
}

export const drawerWidth = 400

export const Editor = () => {
  const { workflowId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const student = location.pathname.startsWith('/student/')
  const ltiMode = search.get('lti') === '1' || student
  const session = ltiMode ? null : workspaceStore.active()
  const token = session?.token ?? null
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [canvas, setCanvas] = useState<LGraphCanvas | null>(null)
  const [selection, setSelection] = useState<LGraphNode[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [railMode, setRailMode] = useState<'inspector' | 'preview'>(
    student ? 'preview' : 'inspector'
  )
  const [railOpen, setRailOpen] = useState(true)
  const [developerTools, setDeveloperTools] = useState(false)
  const [blocks, setBlocks] = useState<WorkflowTemplate[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [connectionSuggestions, setConnectionSuggestions] = useState<
    ConnectionSuggestion[]
  >([])
  const taskView = useRef<TaskViewHandle | null>(null)
  const navigationBypass = useRef<string | null>(null)
  const lgraph = useMemo(() => new LiteGraph.LGraph(), [])
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))

  useEffect(() => {
    let active = true
    void api
      .workflow(workflowId, token)
      .then(({ workflow: loaded }) => {
        const parsed = parseWorkflow(loaded.content ?? '{"nodes":[]}')
        lgraph.configure(parsed)
        prepareGraph(lgraph, parsed)
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

  useEffect(() => {
    if (!student)
      void api
        .templates('BLOCK')
        .then(setBlocks)
        .catch(() => setBlocks([]))
  }, [student])

  const autosave = useAutosave({
    graph: lgraph,
    workflowId,
    token,
    initialVersion: workflow?.version ?? 1,
    enabled: workflow !== null && !student
  })
  const { history, canUndo, canRedo } = useGraphHistory(lgraph, canvas)
  const { socket, connectionStatus, runGraph, cancelRun } = useSocket({
    workflowId,
    workspaceToken: token,
    lgraph
  })
  const {
    outputs,
    question,
    image,
    maxInputChars,
    processingPercentage,
    attemptState,
    runId,
    runState,
    trace,
    beginAttempt
  } = useServerEvents({ socket, lgraph })

  useEffect(() => {
    configureDebugSession({
      workspaceId: session?.id,
      workflowId,
      type: session?.type ?? (ltiMode ? 'LTI' : undefined),
      status: () => autosave.status,
      save: autosave.saveNow
    })
  }, [autosave.saveNow, autosave.status, ltiMode, session?.id, session?.type, workflowId])

  const unsafeToLeave = ['dirty', 'saving', 'error', 'conflict'].includes(autosave.status)
  const blocker = useBlocker(
    ({ nextLocation }) =>
      unsafeToLeave && nextLocation.pathname !== navigationBypass.current
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('This workflow has unsaved changes. Leave the editor?'))
      blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const selectNodes = useCallback(
    (nodes: LGraphNode[]) => {
      setSelection(nodes)
      if (nodes.length && !student) {
        setRailMode('inspector')
        setRailOpen(true)
      }
    },
    [student]
  )

  const showPreview = useCallback(() => {
    setRailMode('preview')
    setRailOpen(true)
  }, [])
  const run = useCallback(() => {
    showPreview()
    window.requestAnimationFrame(() => {
      if (!taskView.current?.submit()) taskView.current?.focusAnswer()
    })
  }, [showPreview])

  const selectTraceNode = useCallback(
    (nodeId: number) => {
      const node = lgraph.getNodeById(nodeId)
      if (!node || !canvas) return
      canvas.selectNode(node)
      canvas.centerOnNode(node)
      setSelection([node])
      if (mobile) setRailOpen(false)
      else setRailMode('preview')
      lgraph.setDirtyCanvas(true, true)
    },
    [canvas, lgraph, mobile]
  )

  const reloadLatest = useCallback(async () => {
    if (!window.confirm('Discard local edits and load the latest saved workflow?')) return
    const { workflow: latest } = await api.workflow(workflowId, token)
    const parsed = parseWorkflow(latest.content ?? '{"nodes":[]}')
    autosave.replaceWithLatest(latest.content ?? '{"nodes":[]}', latest.version)
    prepareGraph(lgraph, parsed)
    history.clear()
    setSelection([])
    setWorkflow(latest)
  }, [autosave, history, lgraph, token, workflowId])

  const importWorkflow = useCallback(
    async (file: File) => {
      try {
        const parsed = parseWorkflow(await file.text())
        history.transact(() => {
          lgraph.configure(parsed)
          prepareGraph(lgraph, parsed)
        })
        setSelection([])
        setNotice('Workflow imported.')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Workflow import failed.')
      }
    },
    [history, lgraph]
  )

  const exportWorkflow = useCallback(() => {
    if (!workflow) return
    const blob = new Blob([JSON.stringify(lgraph.serialize(), null, 2)], {
      type: 'application/json'
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${workflow.slug || 'workflow'}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }, [lgraph, workflow])

  const saveAs = useCallback(
    async (name: string) => {
      if (!token) return
      const created = await api.createWorkflow(
        token,
        name,
        JSON.stringify(lgraph.serialize())
      )
      const destination = `/editor/${created.id}`
      navigationBypass.current = destination
      navigate(destination)
    },
    [lgraph, navigate, token]
  )

  const addBlock = useCallback(
    async (block: WorkflowTemplate) => {
      if (!canvas) return
      try {
        const detail = await api.template(block.slug)
        let suggestions: ConnectionSuggestion[] = []
        history.transact(() => {
          suggestions = insertBlock({
            graph: lgraph,
            canvas,
            content: detail.revision.content,
            requiredNodeTypes: detail.revision.requiredNodeTypes,
            interfaces: detail.revision.interfaces
          }).suggestions
        })
        setConnectionSuggestions(suggestions)
        setSelection(Object.values(canvas.selected_nodes))
        setPaletteOpen(false)
        setNotice(
          suggestions.length
            ? `${suggestions.length} compatible connection suggestion${suggestions.length === 1 ? '' : 's'} available on the inserted block.`
            : 'Block inserted.'
        )
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Block could not be inserted.')
      }
    },
    [canvas, history, lgraph]
  )

  if (loadError)
    return (
      <Box p={4}>
        <Typography color="error">{loadError}</Typography>
      </Box>
    )
  if (!workflow)
    return (
      <Box p={4}>
        <CircularProgress />
      </Box>
    )

  const apiOrigin = new URL(getConfig().API ?? '/api', window.location.origin).origin
  const wsOrigin = new URL(
    getConfig().WS ?? getConfig().API ?? window.location.origin,
    window.location.origin
  ).origin
  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        bgcolor: '#f6f7fb'
      }}
    >
      <EditorToolbar
        workflowName={workflow.name}
        status={autosave.status}
        student={student}
        canSaveAs={!!token}
        ltiInstructor={ltiMode && !student}
        developerTools={developerTools}
        connectionStatus={connectionStatus}
        onAdd={() => setPaletteOpen((open) => !open)}
        onTemplates={() =>
          navigate(
            `/templates?returnTo=${encodeURIComponent(location.pathname + location.search)}`
          )
        }
        onRun={run}
        onPreview={showPreview}
        onSaveAs={saveAs}
        onImport={importWorkflow}
        onExport={exportWorkflow}
        onDeveloperTools={setDeveloperTools}
        onPublish={async () => {
          await api.publishWorkflow(token, workflowId)
          setNotice('Workflow published to students.')
        }}
        onRetry={() => {
          void autosave.saveNow()
        }}
        onReloadLatest={() => {
          void reloadLatest()
        }}
        connectionInfo={{
          apiOrigin,
          wsOrigin,
          workspaceType: session?.type ?? (ltiMode ? 'LTI' : 'Browser'),
          workflowId
        }}
      />
      <Box sx={{ minHeight: 0, display: 'flex', position: 'relative' }}>
        {!student && paletteOpen && (
          <NodePalette
            graph={lgraph}
            canvas={canvas}
            blocks={blocks}
            onMutate={history.transact}
            onAddNode={() => setPaletteOpen(false)}
            onAddBlock={(block) => {
              void addBlock(block)
            }}
          />
        )}
        <Box sx={{ minWidth: 0, flex: 1, height: '100%' }}>
          <Canvas
            lgraph={lgraph}
            readOnly={student}
            developerTools={developerTools}
            onReady={setCanvas}
            onSelectionChange={selectNodes}
          />
        </Box>
        <EditorRail mobile={mobile} open={railOpen} onClose={() => setRailOpen(false)}>
          {!!connectionSuggestions.length && (
            <Alert severity="info" onClose={() => setConnectionSuggestions([])}>
              Suggested connections:{' '}
              {connectionSuggestions
                .slice(0, 3)
                .map(
                  (suggestion) =>
                    `${suggestion.existingNodeId} ${suggestion.direction === 'input' ? '→' : '←'} ${suggestion.name}`
                )
                .join(', ')}
            </Alert>
          )}
          {processingPercentage > 0 && processingPercentage < 100 && (
            <Alert severity="info">Running: {processingPercentage}%</Alert>
          )}
          {railMode === 'preview' ? (
            <TaskView
              ref={taskView}
              question={question}
              questionImage={image}
              onSubmit={(answer) => beginAttempt(runGraph({ answer }))}
              outputs={outputs}
              maxInputChars={maxInputChars}
              disabled={attemptState === 'running' || runState === 'queued'}
              runId={runId}
              runState={runState}
              trace={trace}
              onCancel={() => runId && cancelRun(runId)}
              onSelectTraceNode={selectTraceNode}
            />
          ) : (
            <NodeInspector selection={selection} history={history} />
          )}
        </EditorRail>
      </Box>
      <Snackbar
        open={!!notice}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
        message={notice}
      />
      <Box sx={{ display: 'none' }} data-can-undo={canUndo} data-can-redo={canRedo} />
    </Box>
  )
}

export default Editor
