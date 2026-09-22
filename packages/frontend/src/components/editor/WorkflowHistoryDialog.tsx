import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import RestoreIcon from '@mui/icons-material/Restore'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { WorkflowVersion, WorkflowVersionReason } from '@/api/http'

/** What each capture reason means to the person reading the list. */
const REASON_LABELS: Record<WorkflowVersionReason, string> = {
  save: 'Before an edit',
  reset: 'Before reset to template',
  restore: 'Before an earlier restore'
}

type Pending = { id: string; action: 'restore' | 'delete' }

export type WorkflowHistoryDialogProps = {
  open: boolean
  /** The live version, shown so the list reads as a past the workflow has left. */
  currentVersion: number
  onClose: () => void
  onLoad: () => Promise<WorkflowVersion[]>
  onRestore: (versionId: string) => Promise<void>
  onDelete: (versionId: string) => Promise<void>
  onClear: () => Promise<void>
}

/**
 * Version history (SPEC-0021/FR-006 to FR-008).
 *
 * Restoring and deleting both destroy something, so neither happens on a single click:
 * the row that is about to change explains what will happen and asks again. The
 * confirmation lives in the row rather than in a second dialog, so the list — and the
 * entry being acted on — stays visible while the question is answered.
 */
export const WorkflowHistoryDialog = ({
  open,
  currentVersion,
  onClose,
  onLoad,
  onRestore,
  onDelete,
  onClear
}: WorkflowHistoryDialogProps) => {
  const [versions, setVersions] = useState<WorkflowVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [clearing, setClearing] = useState(false)
  const [busy, setBusy] = useState(false)

  const formatWhen = useMemo(() => {
    const format = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short'
    })
    return (iso: string) => format.format(new Date(iso))
  }, [])

  const load = useCallback(() => {
    setError(null)
    setVersions(null)
    onLoad()
      .then(setVersions)
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : 'Version history could not be read.'
        )
      )
  }, [onLoad])

  useEffect(() => {
    if (!open) return
    setPending(null)
    setClearing(false)
    load()
  }, [load, open])

  const act = async (run: () => Promise<void>, reload: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await run()
      setPending(null)
      setClearing(false)
      if (reload) load()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The action failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Version history</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Earlier states of this workflow, newest first. The editor is at version{' '}
          {currentVersion}; restoring one of these keeps it in the history too.
        </Typography>
        {error && (
          <Alert
            severity="error"
            sx={{ my: 1 }}
            action={
              <Button color="inherit" size="small" onClick={load}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        {!versions && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress aria-label="Loading version history" />
          </Box>
        )}
        {versions?.length === 0 && (
          <Typography sx={{ py: 2 }}>
            No earlier versions yet. One is kept the first time you change the graph after
            a few minutes of work, and before every reset or restore.
          </Typography>
        )}
        {!!versions?.length && (
          <List disablePadding>
            {versions.map((version) => (
              <ListItem
                key={version.id}
                divider
                disableGutters
                sx={{ display: 'block', py: 1 }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <ListItemText
                    primary={`Version ${version.version}`}
                    secondary={`${formatWhen(version.createdAt)} · ${version.nodeCount} node${
                      version.nodeCount === 1 ? '' : 's'
                    }`}
                  />
                  <Chip size="small" label={REASON_LABELS[version.reason]} />
                  <Button
                    size="small"
                    startIcon={<RestoreIcon />}
                    disabled={busy}
                    onClick={() => setPending({ id: version.id, action: 'restore' })}
                  >
                    Restore
                  </Button>
                  <Tooltip title="Delete this version">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Delete version ${version.version}`}
                        disabled={busy}
                        onClick={() => setPending({ id: version.id, action: 'delete' })}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
                {pending?.id === version.id && (
                  <Box sx={{ pb: 1 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {pending.action === 'restore'
                        ? 'Load this version into the editor? The current graph is saved to the history first.'
                        : 'Delete this version? It cannot be brought back.'}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => setPending(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        color={pending.action === 'delete' ? 'error' : 'primary'}
                        variant="contained"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              pending.action === 'restore'
                                ? onRestore(version.id)
                                : onDelete(version.id),
                            pending.action === 'delete'
                          )
                        }
                      >
                        {pending.action === 'restore' ? 'Restore version' : 'Delete'}
                      </Button>
                    </Stack>
                  </Box>
                )}
              </ListItem>
            ))}
          </List>
        )}
        {clearing && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" sx={{ mb: 1 }}>
              Delete every stored version? The workflow itself is untouched.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => setClearing(false)}>
                Cancel
              </Button>
              <Button
                size="small"
                color="error"
                variant="contained"
                disabled={busy}
                onClick={() => void act(onClear, true)}
              >
                Delete all versions
              </Button>
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {!!versions?.length && !clearing && (
          <Button color="error" disabled={busy} onClick={() => setClearing(true)}>
            Clear history
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
