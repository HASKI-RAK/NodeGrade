import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import { useCallback, useMemo, useState } from 'react'

import type { RunDetail, RunFilter, RunReview, RunsSummary, RunSummary } from '@/api/http'
import { ApiError } from '@/api/http'
import type { PreviewLocale, PreviewMessages } from '@/i18n/preview'

import { ResultCard } from './ResultCard'

export type SubmissionsViewProps = {
  messages: PreviewMessages
  locale: PreviewLocale
  runs: RunSummary[]
  summary: RunsSummary
  filter: RunFilter
  loading: boolean
  error: { code?: string; message?: string } | null
  onFilterChange: (filter: RunFilter) => void
  onRefresh: () => void
  onLoadDetail: (runId: string) => Promise<RunDetail>
  /** Absent in a read-only host: no review controls are shown. */
  onSetReview?: (runId: string, review: RunReview) => Promise<RunSummary>
  /** Absent when the host cannot start a run: no "Run again" is shown. */
  onRunAgain?: (answer: string) => void
  runDisabled?: boolean
}

type ChipColor = 'default' | 'warning' | 'success' | 'error'

/** One status per run, shared by the list row and the detail header (FR-009). */
const statusOf = (
  run: RunSummary,
  messages: PreviewMessages
): { label: string; color: ChipColor } => {
  if (run.outcome === 'FAILED') return { label: messages.failed, color: 'error' }
  if (run.reviewedAt) return { label: messages.reviewed, color: 'success' }
  if (run.flagged) return { label: messages.needsReview, color: 'warning' }
  return { label: messages.noIssueFound, color: 'default' }
}

const FILTERS: { value: RunFilter; label: (messages: PreviewMessages) => string }[] = [
  { value: 'all', label: (messages) => messages.filterAll },
  { value: 'needs-review', label: (messages) => messages.needsReview },
  { value: 'reviewed', label: (messages) => messages.reviewed },
  { value: 'failed', label: (messages) => messages.failed }
]

const StatusChips = ({
  run,
  messages
}: {
  run: RunSummary
  messages: PreviewMessages
}) => {
  const status = statusOf(run, messages)
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Chip size="small" label={status.label} color={status.color} />
      {run.score !== null && (
        <Chip size="small" variant="outlined" label={messages.scoreChip(run.score)} />
      )}
    </Stack>
  )
}

const Tile = ({ label, value }: { label: string; value: number }) => (
  <Paper variant="outlined" aria-label={label} sx={{ flex: 1, px: 1.5, py: 1 }}>
    <Typography variant="h5" component="p">
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
  </Paper>
)

/**
 * The participant's inbox: every run of this workflow as a tutor would see it, with
 * the flagged ones to the front (SPEC-0020/FR-009 to FR-012). A run opens in place; the
 * list is one Back away and keeps its filter.
 */
export const SubmissionsView = ({
  messages,
  locale,
  runs,
  summary,
  filter,
  loading,
  error,
  onFilterChange,
  onRefresh,
  onLoadDetail,
  onSetReview,
  onRunAgain,
  runDisabled = false
}: SubmissionsViewProps) => {
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [detailError, setDetailError] = useState<{ code?: string } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const formatWhen = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short'
    })
    return (iso: string) => format.format(new Date(iso))
  }, [locale])

  const openDetail = useCallback(
    (runId: string) => {
      setOpenRunId(runId)
      setDetail(null)
      setDetailError(null)
      setNote('')
      setSaveError(false)
      setDetailLoading(true)
      onLoadDetail(runId)
        .then((loaded) => {
          setDetail(loaded)
          setNote(loaded.reviewNote ?? '')
        })
        .catch((failure: unknown) => {
          setDetailError(failure instanceof ApiError ? { code: failure.body.code } : {})
        })
        .finally(() => setDetailLoading(false))
    },
    [onLoadDetail]
  )

  const back = () => {
    setOpenRunId(null)
    setDetail(null)
    setDetailError(null)
  }

  const saveReview = async (review: RunReview) => {
    if (!detail || !onSetReview) return
    setSaving(true)
    setSaveError(false)
    try {
      const updated = await onSetReview(detail.id, review)
      setDetail({ ...detail, ...updated })
      setNote(updated.reviewNote ?? '')
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (openRunId !== null) {
    const meta = detail && (
      <Typography variant="caption" color="text.secondary">
        {formatWhen(detail.startedAt)} · {messages.runDuration(detail.durationMs)}
        {detail.submittedBy && ` · ${messages.submittedBy(detail.submittedBy)}`}
      </Typography>
    )
    return (
      <Stack spacing={2} aria-label={messages.submissionDetail}>
        <Box>
          <Button size="small" onClick={back}>
            {messages.back}
          </Button>
        </Box>
        {detailLoading && <LinearProgress />}
        {detailError && (
          <Alert
            severity="error"
            action={
              detailError.code === 'run_not_found' ? undefined : (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => openDetail(openRunId)}
                >
                  {messages.retry}
                </Button>
              )
            }
          >
            {detailError.code === 'run_not_found'
              ? messages.submissionGone
              : messages.submissionsLoadFailed}
          </Alert>
        )}
        {detail && (
          <>
            {meta}
            <StatusChips run={detail} messages={messages} />
            {detail.flagged && (
              <Alert severity="warning">
                <Typography variant="subtitle2">{messages.flagReason}</Typography>
                {detail.flagReason || messages.reviewNoReason}
              </Alert>
            )}
            {detail.outcome === 'FAILED' && (
              <Alert severity="error">{detail.errorMessage || messages.runFailed}</Alert>
            )}
            <Box>
              <Typography variant="subtitle2">{messages.answerHeading}</Typography>
              {detail.answer ? (
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {detail.answer}
                </Typography>
              ) : (
                <Typography color="text.secondary" fontStyle="italic">
                  {messages.emptyAnswer}
                </Typography>
              )}
            </Box>
            <Stack spacing={1.5} aria-label={messages.resultsHeading}>
              <Typography variant="subtitle2">{messages.resultsHeading}</Typography>
              {detail.outputs.length === 0 && (
                <Typography color="text.secondary">{messages.noOutputs}</Typography>
              )}
              {detail.outputs.map((output, index) => (
                <ResultCard
                  key={`${output.uniqueId}-${index}`}
                  output={output}
                  messages={messages}
                />
              ))}
            </Stack>
            {onSetReview && detail.outcome !== 'FAILED' && (
              <Stack spacing={1} aria-label={messages.tutorReview}>
                <Typography variant="subtitle2">{messages.tutorReview}</Typography>
                {detail.reviewedAt ? (
                  <>
                    <Typography variant="body2">
                      {messages.reviewedAt(formatWhen(detail.reviewedAt))}
                    </Typography>
                    {detail.reviewNote && (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {detail.reviewNote}
                      </Typography>
                    )}
                    <Box>
                      <Button
                        size="small"
                        disabled={saving}
                        onClick={() => void saveReview({ reviewed: false })}
                      >
                        {messages.reopenReview}
                      </Button>
                    </Box>
                  </>
                ) : (
                  <>
                    <TextField
                      label={messages.reviewNoteLabel}
                      multiline
                      minRows={2}
                      size="small"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      disabled={saving}
                    />
                    <Box>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={saving}
                        onClick={() =>
                          void saveReview({
                            reviewed: true,
                            ...(note.trim() ? { note: note.trim() } : {})
                          })
                        }
                      >
                        {messages.markReviewed}
                      </Button>
                    </Box>
                  </>
                )}
                {saveError && <Alert severity="error">{messages.reviewSaveFailed}</Alert>}
              </Stack>
            )}
            {onRunAgain && (
              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="outlined"
                  size="small"
                  disabled={runDisabled}
                  onClick={() => {
                    // The new run lands in the list, so that is where the inbox returns to.
                    onRunAgain(detail.answer)
                    back()
                  }}
                >
                  {messages.runAgain}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {messages.runAgainHint}
                </Typography>
              </Stack>
            )}
          </>
        )}
      </Stack>
    )
  }

  const showEmpty = !loading && !error && runs.length === 0
  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={1}
        role="group"
        aria-label={messages.submissionCounts}
      >
        <Tile label={messages.submissionsTotal} value={summary.total} />
        <Tile label={messages.needsReview} value={summary.needsReview} />
        <Tile label={messages.reviewed} value={summary.reviewed} />
      </Stack>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={filter}
        onChange={(_, value: RunFilter | null) => value && onFilterChange(value)}
        aria-label={messages.filterSubmissions}
        sx={{ flexWrap: 'wrap' }}
      >
        {FILTERS.map((entry) => (
          <ToggleButton key={entry.value} value={entry.value}>
            {entry.label(messages)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {error && (
        <Alert
          severity="error"
          action={
            <Button size="small" color="inherit" onClick={onRefresh}>
              {messages.retry}
            </Button>
          }
        >
          {messages.submissionsLoadFailed}
        </Alert>
      )}
      {loading && runs.length === 0 && <LinearProgress />}
      {showEmpty && (
        <Typography color="text.secondary">
          {filter === 'all' ? messages.submissionsEmpty : messages.submissionsFilterEmpty}
        </Typography>
      )}
      {runs.length > 0 && (
        <List aria-label={messages.submissionList} dense disablePadding>
          {runs.map((run) => (
            <ListItemButton
              key={run.id}
              onClick={() => openDetail(run.id)}
              sx={{ display: 'block', borderRadius: 1 }}
            >
              <Stack spacing={0.5}>
                <Typography variant="caption" color="text.secondary">
                  {formatWhen(run.startedAt)} · {messages.runDuration(run.durationMs)}
                  {run.submittedBy && ` · ${messages.submittedBy(run.submittedBy)}`}
                </Typography>
                <StatusChips run={run} messages={messages} />
                <Typography
                  variant="body2"
                  color={run.answerExcerpt ? 'text.primary' : 'text.secondary'}
                  fontStyle={run.answerExcerpt ? undefined : 'italic'}
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    overflowWrap: 'anywhere'
                  }}
                >
                  {run.answerExcerpt || messages.emptyAnswer}
                </Typography>
              </Stack>
            </ListItemButton>
          ))}
        </List>
      )}
      {filter === 'all' && runs.length > 0 && runs.length < summary.total && (
        <Typography variant="caption" color="text.secondary">
          {messages.showingLatest(runs.length)}
        </Typography>
      )}
    </Stack>
  )
}
