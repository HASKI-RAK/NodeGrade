import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RunSummary } from '@/api/http'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

import { useSubmissions } from './useSubmissions'

const run = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  id: 'run-1',
  outcome: 'COMPLETED',
  answerExcerpt: 'The Earth turns.',
  flagged: true,
  flagReason: 'Unclear.',
  needsReview: true,
  score: null,
  submittedBy: null,
  reviewedAt: null,
  reviewNote: null,
  startedAt: '2026-09-22T10:00:00.000Z',
  finishedAt: '2026-09-22T10:00:03.000Z',
  durationMs: 3000,
  ...overrides
})

const summary = { total: 1, needsReview: 1, reviewed: 0, failed: 0 }

const listStub = () =>
  stubApi((url, init) => {
    if (url.includes('/api/workflows/workflow-1/runs?') && init.method === undefined)
      return jsonResponse({ runs: [run()], summary })
    throw new Error(`unexpected request: ${url} ${init.method ?? 'GET'}`)
  })

const listCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/runs?'))

describe('useSubmissions', () => {
  afterEach(() => {
    // The fetch stub is global; leave nothing behind for the next test file.
    vi.unstubAllGlobals()
  })

  it('lists with the bearer token and the filter, and exposes the summary', async () => {
    const fetchMock = listStub()
    const { result } = renderHook(() =>
      useSubmissions({ workflowId: 'workflow-1', token: 'tok', enabled: true })
    )

    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    expect(result.current.summary).toEqual(summary)
    expect(result.current.loading).toBe(false)
    const [url, init] = listCalls(fetchMock)[0] as [string, RequestInit]
    expect(url.endsWith('/api/workflows/workflow-1/runs?filter=all')).toBe(true)
    expect(authorizationOf(init)).toBe('Bearer tok')
  })

  it('fetches nothing while disabled (FR-007)', async () => {
    const fetchMock = listStub()
    const { result } = renderHook(() =>
      useSubmissions({ workflowId: 'workflow-1', token: 'tok', enabled: false })
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.runs).toEqual([])
    expect(result.current.summary.total).toBe(0)
  })

  it('refetches when the filter changes', async () => {
    const fetchMock = listStub()
    const { result } = renderHook(() =>
      useSubmissions({ workflowId: 'workflow-1', token: 'tok', enabled: true })
    )
    await waitFor(() => expect(result.current.runs).toHaveLength(1))

    act(() => result.current.setFilter('needs-review'))

    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(2))
    expect(String(listCalls(fetchMock)[1][0]).endsWith('?filter=needs-review')).toBe(true)
    expect(result.current.filter).toBe('needs-review')
  })

  it('refetches once the run is stored, not while it is queued or running', async () => {
    const fetchMock = listStub()
    const { result, rerender } = renderHook(
      (props: {
        runId?: string
        runState?: 'queued' | 'running' | 'completed' | 'failed'
      }) =>
        useSubmissions({
          workflowId: 'workflow-1',
          token: 'tok',
          enabled: true,
          ...props
        }),
      { initialProps: {} }
    )
    await waitFor(() => expect(result.current.runs).toHaveLength(1))

    rerender({ runId: 'run-9', runState: 'queued' })
    rerender({ runId: 'run-9', runState: 'running' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listCalls(fetchMock)).toHaveLength(1)

    rerender({ runId: 'run-9', runState: 'completed' })
    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(2))

    rerender({ runId: 'run-10', runState: 'failed' })
    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(3))
  })

  it('marks a run reviewed through PATCH, replaces the row and refreshes the counts', async () => {
    const reviewed = run({
      needsReview: false,
      reviewedAt: '2026-09-22T11:00:00.000Z',
      reviewNote: 'ok'
    })
    // The stub behaves like the server: once reviewed, the list says so too.
    let stored = run()
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith('/api/workflows/workflow-1/runs/run-1/review')) {
        stored = reviewed
        return jsonResponse({ run: reviewed })
      }
      if (url.includes('/api/workflows/workflow-1/runs?'))
        return jsonResponse({
          runs: [stored],
          summary: { ...summary, needsReview: stored.needsReview ? 1 : 0 }
        })
      throw new Error(`unexpected request: ${url}`)
    })
    const { result } = renderHook(() =>
      useSubmissions({ workflowId: 'workflow-1', token: 'tok', enabled: true })
    )
    await waitFor(() => expect(result.current.runs).toHaveLength(1))

    let returned: RunSummary | undefined
    await act(async () => {
      returned = await result.current.setReview('run-1', { reviewed: true, note: 'ok' })
    })

    const [, init] = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/review')
    ) as [string, RequestInit]
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ reviewed: true, note: 'ok' })
    expect(authorizationOf(init)).toBe('Bearer tok')
    expect(returned).toEqual(reviewed)
    expect(result.current.runs[0].reviewedAt).toBe('2026-09-22T11:00:00.000Z')
    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(2))
    await waitFor(() => expect(result.current.summary.needsReview).toBe(0))
  })

  it('loads a detail for the same workflow and token', async () => {
    const fetchMock = stubApi((url) => {
      if (url.endsWith('/api/workflows/workflow-1/runs/run-1'))
        return jsonResponse({
          run: { ...run(), answer: 'Full', outputs: [], errorMessage: null }
        })
      if (url.includes('/runs?')) return jsonResponse({ runs: [], summary })
      throw new Error(`unexpected request: ${url}`)
    })
    const { result } = renderHook(() =>
      useSubmissions({ workflowId: 'workflow-1', token: 'tok', enabled: true })
    )

    const detail = await result.current.loadDetail('run-1')

    expect(detail.answer).toBe('Full')
    const [, init] = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/runs/run-1')
    ) as [string, RequestInit]
    expect(authorizationOf(init)).toBe('Bearer tok')
  })

  it('surfaces the server error code when the list cannot be loaded', async () => {
    stubApi(() =>
      jsonResponse(
        { code: 'workflow_not_found', message: 'No such workflow in this workspace.' },
        { status: 404 }
      )
    )
    const { result } = renderHook(() =>
      useSubmissions({ workflowId: 'workflow-2', token: 'tok', enabled: true })
    )

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.code).toBe('workflow_not_found')
    expect(result.current.loading).toBe(false)
    expect(result.current.runs).toEqual([])
  })
})
