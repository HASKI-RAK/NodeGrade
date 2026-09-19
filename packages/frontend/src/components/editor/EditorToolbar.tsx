import AddIcon from '@mui/icons-material/Add'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import VisibilityIcon from '@mui/icons-material/Visibility'
import {
  AppBar,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material'
import { useRef, useState } from 'react'

import { ColorSchemeMenuItems } from '@/components/ColorSchemeMenuItems'
import type { SaveStatus } from '@/hooks/useAutosave'

import { CATEGORY_DESCRIPTIONS, CATEGORY_ORDER } from './categoryInfo'
import { CategoryPill } from './CategoryPill'

const labels: Record<SaveStatus, string> = {
  loading: 'Loading…',
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  conflict: 'Save conflict',
  error: 'Save failed'
}

export const EditorToolbar = ({
  workflowName,
  status,
  student,
  canSaveAs,
  canReset,
  ltiInstructor,
  developerTools,
  connectionStatus,
  onAdd,
  onTemplates,
  onRun,
  onPreview,
  onSaveAs,
  onImport,
  onExport,
  onReset,
  onDeveloperTools,
  onPublish,
  onRetry,
  onReloadLatest,
  connectionInfo
}: {
  workflowName: string
  status: SaveStatus
  student: boolean
  canSaveAs: boolean
  canReset: boolean
  ltiInstructor: boolean
  developerTools: boolean
  connectionStatus: string
  onAdd: () => void
  onTemplates: () => void
  onRun: () => void
  onPreview: () => void
  onSaveAs: (name: string) => Promise<void>
  onImport: (file: File) => Promise<void>
  onExport: () => void
  onReset: () => Promise<void>
  onDeveloperTools: (enabled: boolean) => void
  onPublish: () => Promise<void>
  onRetry: () => void
  onReloadLatest: () => void
  connectionInfo: {
    apiOrigin: string
    wsOrigin: string
    workspaceType: string
    workflowId: string
  }
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [name, setName] = useState(`${workflowName} copy`)
  const fileRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <AppBar position="static" color="inherit" elevation={1}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography
            variant="h6"
            noWrap
            sx={{ mr: 'auto', maxWidth: { xs: 140, sm: 320 } }}
          >
            {workflowName}
          </Typography>
          {!student && (
            <Button startIcon={<AddIcon />} onClick={onAdd}>
              Add
            </Button>
          )}
          {!student && (
            <Button
              onClick={onTemplates}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Templates
            </Button>
          )}
          <Button startIcon={<PlayArrowIcon />} onClick={onRun}>
            Run
          </Button>
          <Button
            startIcon={<VisibilityIcon />}
            onClick={onPreview}
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Preview
          </Button>
          {!student && (
            <Tooltip title={connectionStatus}>
              <Chip
                size="small"
                label={labels[status]}
                color={status === 'error' || status === 'conflict' ? 'error' : 'default'}
                onClick={
                  status === 'error'
                    ? onRetry
                    : status === 'conflict'
                      ? onReloadLatest
                      : undefined
                }
              />
            </Tooltip>
          )}
          <Tooltip title="Node colors and adding nodes">
            <IconButton aria-label="Editor help" onClick={() => setHelpOpen(true)}>
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
          <IconButton
            aria-label="More editor actions"
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {!student && (
          <MenuItem
            disabled={!canSaveAs}
            onClick={() => {
              setAnchor(null)
              setSaveAsOpen(true)
            }}
          >
            Save as…
          </MenuItem>
        )}
        {!student && canReset && (
          <MenuItem
            onClick={() => {
              setAnchor(null)
              setResetOpen(true)
            }}
          >
            Reset to source template…
          </MenuItem>
        )}
        {!student && (
          <MenuItem
            onClick={() => {
              setAnchor(null)
              fileRef.current?.click()
            }}
          >
            Import workflow…
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setAnchor(null)
            onExport()
          }}
        >
          Export workflow
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null)
            setConnectionOpen(true)
          }}
        >
          Connection information
        </MenuItem>
        <Divider />
        <ColorSchemeMenuItems onSelect={() => setAnchor(null)} />
        {!student && (
          <MenuItem>
            <FormControlLabel
              control={
                <Switch
                  checked={developerTools}
                  onChange={(_, checked) => onDeveloperTools(checked)}
                />
              }
              label="Developer tools"
            />
          </MenuItem>
        )}
        {ltiInstructor && (
          <>
            <Divider />
            <MenuItem
              onClick={() => {
                setAnchor(null)
                void onPublish()
              }}
            >
              Publish to students
            </MenuItem>
          </>
        )}
      </Menu>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onImport(file)
          event.target.value = ''
        }}
      />
      <Dialog
        open={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Save workflow as</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin="dense"
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveAsOpen(false)}>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => void onSaveAs(name.trim()).then(() => setSaveAsOpen(false))}
          >
            Create copy
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} maxWidth="xs">
        <DialogTitle>Reset to source template?</DialogTitle>
        <DialogContent>
          <Typography>
            This restores the template revision used to create this workflow and discards
            every graph edit.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button
            color="error"
            disabled={resetting}
            onClick={async () => {
              setResetting(true)
              try {
                await onReset()
                setResetOpen(false)
              } finally {
                setResetting(false)
              }
            }}
          >
            Reset workflow
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={connectionOpen}
        onClose={() => setConnectionOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Connection information</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>
              <strong>Status:</strong> {connectionStatus}
            </Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              <strong>API origin:</strong> {connectionInfo.apiOrigin}
            </Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              <strong>WebSocket origin:</strong> {connectionInfo.wsOrigin}
            </Typography>
            <Typography>
              <strong>Workspace type:</strong> {connectionInfo.workspaceType}
            </Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              <strong>Workflow ID:</strong> {connectionInfo.workflowId}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConnectionOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Node colors and adding nodes</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2">
              Each node&apos;s title bar shows its type. The pill color shows its
              category.
            </Typography>
            <Stack spacing={1}>
              {CATEGORY_ORDER.map((category) => (
                <Stack key={category} direction="row" spacing={1.5} alignItems="center">
                  <CategoryPill category={category} />
                  <Typography variant="body2">
                    {CATEGORY_DESCRIPTIONS[category]}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Typography variant="subtitle2">Adding nodes</Typography>
            <Typography variant="body2" component="div">
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li>Click Add in the top bar to open the node palette.</li>
                <li>Search, then click a node to insert it at the canvas center.</li>
                <li>
                  Drag from an output dot to an input dot to connect them. Dot colors show
                  the value type they carry.
                </li>
              </ol>
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
