import type { RunState } from '@haski/ta-lib'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  api,
  ApiError,
  type RunDetail,
  type RunFilter,
  type RunReview,
  type RunsSummary,
  type RunSummary
} from '@/api/http'

export type SubmissionsError = { code?: string; message?: string }

export type UseSubmissionsInput = {
  workflowId: string
  token: string | null
  /** False for students and before the workflow loaded: nothing is fetched. */
  enabled: boolean
  /** The in-flight run; the list refetches once it reaches a stored state. */
  runId?: string
  runState?: RunState
}

export type UseSubmissionsResult = {
  runs: RunSummary[]
  summary: RunsSummary
  filter: RunFilter
  loading: boolean
  error: SubmissionsError | null
  setFilter: (filter: RunFilter) => void
  refresh: () => void
  loadDetail: (runId: string) => Promise<RunDetail>
  setReview: (runId: string, review: RunReview) => Promise<RunSummary>
}

export const EMPTY_RUNS_SUMMARY: RunsSummary = {
  total: 0,
  needsReview: 0,
  reviewed: 0,
  failed: 0
}

const toError = (error: unknown): SubmissionsError =>
  error instanceof ApiError
    ? { code: error.body.code, message: error.message }
    : { message: error instanceof Error ? error.message : undefined }

/**
 * The Submissions inbox behind the preview rail (SPEC-0020/FR-009, FR-011).
 *
 * The list refetches on the run's terminal `runStateChanged` rather than on the local
 * attempt state: the server writes the record before it emits that event, while a
 * local cancel or a dead-socket failure never stored anything. A stale response from an
 * earlier filter or workflow is dropped by sequence number.
 */
export function useSubmissions({
  workflowId,
  token,
  enabled,
  runId,
  runState
}: UseSubmissionsInput): UseSubmissionsResult {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [summary, setSummary] = useState<RunsSummary>(EMPTY_RUNS_SUMMARY)
  const [filter, setFilter] = useState<RunFilter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<SubmissionsError | null>(null)
  const sequence = useRef(0)

  const refresh = useCallback(() => {
    if (!enabled) return
    const request = ++sequence.current
    setLoading(true)
    void api
      .runs(workflowId, token, filter)
      .then((data) => {
        if (request !== sequence.current) return
        setRuns(data.runs)
        setSummary(data.summary)
        setError(null)
      })
      .catch((failure: unknown) => {
        if (request !== sequence.current) return
        setError(toError(failure))
      })
      .finally(() => {
        if (request === sequence.current) setLoading(false)
      })
  }, [enabled, filter, token, workflowId])

  useEffect(() => {
    if (!enabled) {
      sequence.current += 1
      setRuns([])
      setSummary(EMPTY_RUNS_SUMMARY)
      setError(null)
      setLoading(false)
      return
    }
    refresh()
  }, [enabled, refresh])

  // Only the run identity and its state may trigger this refetch; a filter change
  // already refetches above and must not fetch twice.
  const latestRefresh = useRef(refresh)
  latestRefresh.current = refresh
  useEffect(() => {
    if (!runId) return
    if (runState === 'completed' || runState === 'failed') latestRefresh.current()
  }, [runId, runState])

  const loadDetail = useCallback(
    (id: string) => api.run(workflowId, id, token),
    [token, workflowId]
  )

  const setReview = useCallback(
    async (id: string, review: RunReview) => {
      const updated = await api.reviewRun(token, workflowId, id, review)
      setRuns((current) => current.map((run) => (run.id === updated.id ? updated : run)))
      latestRefresh.current()
      return updated
    },
    [token, workflowId]
  )

  return useMemo(
    () => ({
      runs,
      summary,
      filter,
      loading,
      error,
      setFilter,
      refresh,
      loadDetail,
      setReview
    }),
    [error, filter, loadDetail, loading, refresh, runs, setReview, summary]
  )
}
