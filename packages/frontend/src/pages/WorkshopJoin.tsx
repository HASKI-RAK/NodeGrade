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
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  api,
  ApiError,
  type CurrentWorkshop,
  type ReadinessCheck,
  type Workflow,
  type WorkshopEntry
} from '@/api/http'
import {
  TemplateCard,
  TemplateDescription,
  TemplateStructure,
  TemplateTags
} from '@/components/TemplateCard'
import { workspaceStore } from '@/store/workspaceStore'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

const UNAVAILABLE =
  'This workshop is unavailable. Check the code on your handout, or ask the facilitator whether the workshop is still open.'

const UNREACHABLE = 'Could not reach the server. Check your connection and try again.'

type Overview = CurrentWorkshop & { token: string; workflows: Workflow[] }

/**
 * `/workshop/:code`: joins the workshop and shows its overview (SPEC-0022/FR-006 to FR-009).
 *
 * A participant who already holds this workshop's token goes straight to the overview —
 * which still answers once the workshop has closed, read-only (FR-017). Otherwise the
 * preflight runs, then the join; a single-entry workshop opens its copy in the editor
 * instead of the overview (FR-007).
 */
export const WorkshopJoin = () => {
  const { code = '' } = useParams()
  const normalized = normalizeWorkshopCode(code)
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [failedChecks, setFailedChecks] = useState<ReadinessCheck[] | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)

  useEffect(() => {
    let active = true

    const showOverview = async (token: string) => {
      const [current, workflows] = await Promise.all([
        api.currentWorkshop(token),
        api.workflows(token)
      ])
      if (!active) return
      const stored = workspaceStore.workshop(normalized)
      if (stored)
        workspaceStore.saveWorkshop(normalized, { ...stored, workshop: current.workshop })
      setOverview({ ...current, token, workflows })
    }

    const join = async () => {
      setError(null)
      setFailedChecks(null)
      setOverview(null)
      if (!normalized) {
        setError(UNAVAILABLE)
        return
      }
      try {
        const stored = workspaceStore.workshop(normalized)
        if (stored?.token) {
          try {
            workspaceStore.saveWorkshop(normalized, stored)
            await showOverview(stored.token)
            return
          } catch (storedError) {
            // A token the server no longer honours (retention, reset database) falls
            // through to a fresh join; anything else is reported.
            if (!(storedError instanceof ApiError) || storedError.status !== 401)
              throw storedError
          }
        }

        // Preflight first: a workshop without a loadable template or a runnable model
        // fails for everyone in the room at once, and it fails less confusingly here than
        // after a participant has started editing (SPEC-0007/FR-009, AC-007).
        const readiness = await api.workshopPreflight(normalized)
        if (!active) return
        if (readiness.status === 'FAIL') {
          setFailedChecks(readiness.checks.filter((check) => check.status === 'FAIL'))
          return
        }
        const result = await api.joinWorkshop(normalized)
        if (!active) return
        workspaceStore.saveWorkshop(normalized, {
          ...result.workspace,
          token: result.token
        })
        if (result.workflow) {
          navigate(`/editor/${result.workflow.id}`, { replace: true })
          return
        }
        await showOverview(result.token)
      } catch (joinError) {
        if (!active) return
        // A closed, expired or unknown code is one user-facing state; a transport failure
        // is a different one, because only the second is worth retrying.
        setError(joinError instanceof ApiError ? UNAVAILABLE : UNREACHABLE)
      }
    }
    void join()
    return () => {
      active = false
    }
  }, [normalized, navigate, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  if (failedChecks)
    return (
      <Box maxWidth={600} mx="auto" p={4}>
        <Typography variant="h4" gutterBottom>
          Workshop not ready
        </Typography>
        <Stack spacing={1}>
          <Typography>
            The facilitator has to fix this before the workshop can start.
          </Typography>
          {failedChecks.map((check) => (
            <Alert severity="error" key={check.id}>
              {check.label}: {check.detail}
            </Alert>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} mt={2}>
          <Button variant="contained" onClick={retry}>
            Try again
          </Button>
          <Button component={Link} to="/">
            Back to start
          </Button>
        </Stack>
      </Box>
    )

  if (error)
    return (
      <Box maxWidth={600} mx="auto" p={4}>
        <Typography variant="h4" gutterBottom>
          Workshop unavailable
        </Typography>
        <Alert severity="error">{error}</Alert>
        <Stack direction="row" spacing={1} mt={2}>
          <Button variant="contained" onClick={retry}>
            Try again
          </Button>
          <Button component={Link} to="/">
            Back to start
          </Button>
        </Stack>
      </Box>
    )

  if (overview) return <WorkshopOverview overview={overview} />

  return (
    <Box maxWidth={600} mx="auto" p={4}>
      <Stack direction="row" spacing={2} alignItems="center">
        <CircularProgress />
        <Typography>Joining workshop…</Typography>
      </Stack>
    </Box>
  )
}

const WorkshopOverview = ({ overview }: { overview: Overview }) => {
  const navigate = useNavigate()
  const { workshop, entries, workflows, token } = overview
  const [starting, setStarting] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    entry: WorkshopEntry
    content: string | null
  } | null>(null)

  const start = async (entry: WorkshopEntry) => {
    setStarting(entry.id)
    setStartError(null)
    try {
      const { workflow } = await api.startWorkshopEntry(token, entry.id)
      navigate(`/editor/${workflow.id}`)
    } catch (error) {
      setStartError(
        error instanceof ApiError
          ? (error.body.message ?? 'This template could not be started.')
          : UNREACHABLE
      )
      setStarting(null)
    }
  }

  const showStructure = async (entry: WorkshopEntry) => {
    setPreview({ entry, content: null })
    try {
      const structure = await api.workshopEntryStructure(token, entry.id)
      setPreview({ entry, content: structure.content })
    } catch {
      setPreview(null)
      setStartError('The template structure could not be loaded.')
    }
  }

  return (
    <Box maxWidth={1080} mx="auto" p={{ xs: 2, sm: 4 }}>
      <Button component={Link} to="/">
        Back to start
      </Button>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" mb={2}>
        <Typography variant="h4" component="h1">
          {workshop.title}
        </Typography>
        <Chip label={workshop.code} variant="outlined" />
      </Stack>
      {workshop.readOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This workshop has ended. You can still open your workflows and their
          submissions, but you can no longer change or run them.
        </Alert>
      )}
      {startError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setStartError(null)}>
          {startError}
        </Alert>
      )}
      <Typography variant="h5" component="h2" gutterBottom>
        Templates
      </Typography>
      <Box
        sx={{
          columns: { xs: 1, md: 2 },
          columnGap: 2,
          '& > *': { breakInside: 'avoid', mb: 2 }
        }}
      >
        {entries.map((entry) => (
          <TemplateCard
            key={entry.id}
            name={entry.name}
            description={entry.description}
            tags={entry.tags}
            labels={
              entry.category ? <Chip label={entry.category} variant="outlined" /> : null
            }
            footer={
              !entry.available &&
              entry.unavailableReason && (
                <Typography color="text.secondary" variant="body2" mt={1}>
                  Not available right now: {entry.unavailableReason}
                </Typography>
              )
            }
            actions={
              <>
                <Button
                  disabled={!entry.available}
                  onClick={() => void showStructure(entry)}
                >
                  Preview structure
                </Button>
                {entry.myWorkflowId ? (
                  <Button
                    variant="contained"
                    component={Link}
                    to={`/editor/${entry.myWorkflowId}`}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    disabled={!entry.available || workshop.readOnly || starting !== null}
                    onClick={() => void start(entry)}
                  >
                    {starting === entry.id ? 'Starting…' : 'Start'}
                  </Button>
                )}
              </>
            }
          />
        ))}
      </Box>
      <Typography variant="h5" component="h2" gutterBottom mt={2}>
        My workflows
      </Typography>
      {workflows.length === 0 ? (
        <Typography color="text.secondary">
          Start a template above to create your first workflow.
        </Typography>
      ) : (
        <List aria-label="My workflows">
          {workflows.map((workflow) => (
            <ListItem key={workflow.id} disablePadding>
              <ListItemButton onClick={() => navigate(`/editor/${workflow.id}`)}>
                <ListItemText
                  primary={workflow.name}
                  secondary={`Version ${workflow.version}`}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
      <Dialog open={preview !== null} onClose={() => setPreview(null)}>
        <DialogTitle>{preview?.entry.name}</DialogTitle>
        <DialogContent sx={{ minWidth: { sm: 480 } }}>
          {preview && preview.content === null && <CircularProgress />}
          {preview?.content && (
            <Stack spacing={2}>
              <TemplateDescription text={preview.entry.description} />
              <TemplateTags tags={preview.entry.tags} />
              <TemplateStructure content={preview.content} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
