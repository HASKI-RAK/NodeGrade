import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'

import {
  ApiError,
  apiRequest,
  type WorkshopEntryMode,
  type WorkshopReadiness
} from '@/api/http'

import { adminPost, adminPut } from './adminApi'

type WorkshopStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'

/** A workshop entry as the admin API serializes it (SPEC-0022/FR-001). */
type WorkshopEntry = {
  id: string
  templateId: string
  templateName: string
  mode: WorkshopEntryMode
  templateRevisionId: string | null
  revision: number | null
  currentRevision: number
  published: boolean
  deleted: boolean
}

type Workshop = {
  id: string
  title: string
  code: string
  status: WorkshopStatus
  templates: WorkshopEntry[]
}

type Template = { id: string; name: string; published: boolean }
type Revision = { id: string; name: string; revision: number }

/** What the facilitator edits: a template and, when pinned, one of its revisions. */
type DraftEntry = { templateId: string; templateRevisionId: string | null }

const LATEST = 'latest'

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiError || error instanceof Error ? error.message : fallback

/** Loads and caches the revisions of each template the editor shows. */
const useRevisions = () => {
  const [revisions, setRevisions] = useState<Record<string, Revision[]>>({})
  const load = useCallback((templateId: string) => {
    if (!templateId) return
    void apiRequest<{ revisions: Revision[] }>(`/admin/templates/${templateId}`)
      .then(({ data }) =>
        setRevisions((known) => ({ ...known, [templateId]: data.revisions }))
      )
      .catch(() => undefined)
  }, [])
  return { revisions, load }
}

/**
 * Edits the ordered templates of a workshop (SPEC-0022/FR-005). Each row picks a workflow
 * template and whether participants get the newest revision or one pinned revision.
 */
const EntriesEditor = ({
  templates,
  value,
  onChange
}: {
  templates: Template[]
  value: DraftEntry[]
  onChange: (next: DraftEntry[]) => void
}) => {
  const { revisions, load } = useRevisions()
  useEffect(() => {
    value.forEach((entry) => load(entry.templateId))
  }, [load, value])

  const update = (index: number, patch: Partial<DraftEntry>) =>
    onChange(value.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)))
  const move = (index: number, offset: number) => {
    const next = [...value]
    const [entry] = next.splice(index, 1)
    next.splice(index + offset, 0, entry)
    onChange(next)
  }
  const unused = templates.filter(
    (template) => !value.some((entry) => entry.templateId === template.id)
  )

  return (
    <Stack spacing={1.5} aria-label="Workshop templates">
      {value.map((entry, index) => {
        const template = templates.find((item) => item.id === entry.templateId)
        return (
          <Box key={`${entry.templateId}-${index}`}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems="center">
              <TextField
                select
                size="small"
                label={`Template ${index + 1}`}
                value={entry.templateId}
                sx={{ flex: 2, minWidth: 0, width: '100%' }}
                onChange={(event) =>
                  update(index, {
                    templateId: event.target.value,
                    templateRevisionId: null
                  })
                }
              >
                {templates
                  .filter(
                    (option) =>
                      option.id === entry.templateId ||
                      !value.some((other) => other.templateId === option.id)
                  )
                  .map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                      {option.name}
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Version"
                value={entry.templateRevisionId ?? LATEST}
                sx={{ flex: 1, minWidth: 0, width: '100%' }}
                onChange={(event) =>
                  update(index, {
                    templateRevisionId:
                      event.target.value === LATEST ? null : event.target.value
                  })
                }
              >
                <MenuItem value={LATEST}>Newest revision</MenuItem>
                {(revisions[entry.templateId] ?? []).map((revision) => (
                  <MenuItem key={revision.id} value={revision.id}>
                    Revision {revision.revision}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row">
                <IconButton
                  aria-label={`Move template ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpwardIcon />
                </IconButton>
                <IconButton
                  aria-label={`Move template ${index + 1} down`}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownwardIcon />
                </IconButton>
                <IconButton
                  aria-label={`Remove template ${index + 1}`}
                  disabled={value.length === 1}
                  onClick={() => onChange(value.filter((_, at) => at !== index))}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Stack>
            </Stack>
            {template && !template.published && entry.templateRevisionId === null && (
              <Typography variant="body2" color="warning.main" mt={0.5}>
                “{template.name}” is not published: participants cannot start it while it
                follows the newest revision. Publish it, or pin a revision.
              </Typography>
            )}
          </Box>
        )
      })}
      <Box>
        <Button
          disabled={unused.length === 0}
          onClick={() =>
            onChange([...value, { templateId: unused[0].id, templateRevisionId: null }])
          }
        >
          Add template
        </Button>
      </Box>
    </Stack>
  )
}

const entryLabel = (entry: WorkshopEntry) =>
  entry.mode === 'LATEST'
    ? `newest revision (currently r${entry.currentRevision})`
    : `pinned to r${entry.revision}`

/**
 * The facilitator's readiness view (SPEC-0007/FR-010, AC-008; SPEC-0022/FR-016): the same
 * preflight a participant hits on entry, run on demand before the room fills up, with the
 * template checks broken down per entry.
 */
const ReadinessPanel = ({ workshopId }: { workshopId: string }) => {
  const [readiness, setReadiness] = useState<WorkshopReadiness | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await apiRequest<WorkshopReadiness>(
        `/admin/workshops/${workshopId}/readiness`
      )
      setReadiness(data)
    } catch (readinessError) {
      setError(messageOf(readinessError, 'Readiness check failed.'))
    } finally {
      setBusy(false)
    }
  }
  const row = (key: string, status: 'PASS' | 'FAIL', text: string) => (
    <Stack direction="row" spacing={1} alignItems="center" key={key}>
      <Chip
        size="small"
        color={status === 'PASS' ? 'success' : 'error'}
        label={status === 'PASS' ? 'Pass' : 'Fail'}
      />
      <Typography variant="body2">{text}</Typography>
    </Stack>
  )
  return (
    <Stack spacing={1} mt={1}>
      <Box>
        <Button disabled={busy} onClick={() => void check()}>
          Check readiness
        </Button>
      </Box>
      {readiness && (
        <Stack spacing={0.5} aria-label="Workshop readiness">
          {readiness.checks.map((check) =>
            row(check.id, check.status, `${check.label}: ${check.detail}`)
          )}
          {readiness.entries?.map((entry) => (
            <Stack
              key={entry.entryId}
              spacing={0.5}
              pl={2}
              aria-label={`Readiness of ${entry.templateName}`}
            >
              <Typography variant="subtitle2">{entry.templateName}</Typography>
              {entry.checks.map((check) =>
                row(
                  `${entry.entryId}-${check.id}`,
                  check.status,
                  `${check.label}: ${check.detail}`
                )
              )}
            </Stack>
          ))}
        </Stack>
      )}
      {error && <Typography color="error">{error}</Typography>}
    </Stack>
  )
}

const WorkshopCard = ({
  workshop,
  templates,
  onChanged
}: {
  workshop: Workshop
  templates: Template[]
  onChanged: () => Promise<void>
}) => {
  const [editing, setEditing] = useState<DraftEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (actionError) {
      setError(messageOf(actionError, 'The workshop could not be changed.'))
    }
  }
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{workshop.title}</Typography>
        <Typography>
          {workshop.code} · {workshop.status}
        </Typography>
        {editing ? (
          <Stack spacing={1} mt={2}>
            <EntriesEditor templates={templates} value={editing} onChange={setEditing} />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={() =>
                  void act(async () => {
                    await adminPut(`/admin/workshops/${workshop.id}/templates`, {
                      templates: editing
                    })
                    setEditing(null)
                  })
                }
              >
                Save templates
              </Button>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </Stack>
          </Stack>
        ) : (
          <Box component="ol" sx={{ my: 1, pl: 3 }} aria-label="Offered templates">
            {workshop.templates.map((entry) => (
              <li key={entry.id}>
                <Typography variant="body2">
                  {entry.templateName} — {entryLabel(entry)}
                  {entry.deleted ? ' (template deleted)' : ''}
                  {!entry.published && !entry.deleted ? ' (template unpublished)' : ''}
                </Typography>
              </li>
            ))}
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        <Stack direction="row" spacing={1} mt={1}>
          {workshop.status !== 'CLOSED' && !editing && (
            <Button
              onClick={() =>
                setEditing(
                  workshop.templates.map((entry) => ({
                    templateId: entry.templateId,
                    templateRevisionId: entry.templateRevisionId
                  }))
                )
              }
            >
              Edit templates
            </Button>
          )}
          {workshop.status === 'DRAFT' && (
            <Button
              onClick={() =>
                void act(() => adminPost(`/admin/workshops/${workshop.id}/publish`))
              }
            >
              Publish
            </Button>
          )}
          {workshop.status === 'PUBLISHED' && (
            <Button
              color="warning"
              onClick={() =>
                void act(() => adminPost(`/admin/workshops/${workshop.id}/close`))
              }
            >
              Close
            </Button>
          )}
        </Stack>
        <ReadinessPanel workshopId={workshop.id} />
      </CardContent>
    </Card>
  )
}

export const WorkshopAdmin = () => {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [title, setTitle] = useState('WAIE workshop')
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(
    () =>
      apiRequest<{ workshops: Workshop[] }>('/admin/workshops').then(({ data }) =>
        setWorkshops(data.workshops)
      ),
    []
  )
  useEffect(() => {
    void refresh()
    void apiRequest<{ templates: Template[] }>('/admin/templates?kind=WORKFLOW').then(
      ({ data }) => {
        setTemplates(data.templates)
        if (data.templates[0])
          setEntries([{ templateId: data.templates[0].id, templateRevisionId: null }])
      }
    )
  }, [refresh])
  const create = async () => {
    setError(null)
    try {
      await adminPost('/admin/workshops', { title, templates: entries })
      await refresh()
    } catch (createError) {
      setError(messageOf(createError, 'The workshop could not be created.'))
    }
  }
  return (
    <Box>
      <Typography variant="h4">Workshop administration</Typography>
      <Card sx={{ my: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <EntriesEditor templates={templates} value={entries} onChange={setEntries} />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              variant="contained"
              disabled={!title.trim() || entries.length === 0}
              onClick={() => void create()}
            >
              Create workshop
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Stack spacing={2}>
        {workshops.map((workshop) => (
          <WorkshopCard
            key={workshop.id}
            workshop={workshop}
            templates={templates}
            onChanged={refresh}
          />
        ))}
      </Stack>
    </Box>
  )
}
