import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureWorkspaceSession, resetWorkspaceSession } from '@/store/workspaceSession'
import { workspaceStore } from '@/store/workspaceStore'
import { jsonResponse, stubApi } from '@/test/apiStub'

import { useWorkspaceSession } from './useWorkspaceSession'

const workspace = { id: 'ws-1', type: 'BROWSER' as const, label: null, workshopId: null }

const workshopSession = {
  id: 'ws-2',
  type: 'WORKSHOP' as const,
  label: 'WAIE',
  workshopId: 'shop-1',
  workshop: { code: 'ABCD-1234', title: 'WAIE', readOnly: false },
  token: 'workshop-token'
}

const callsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith(suffix) && (init?.method ?? 'GET') === method
  )

describe('useWorkspaceSession', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('activates the browser session on every mount, after a workshop made its own active', async () => {
    const fetchMock = stubApi(() =>
      jsonResponse({ workspace, token: 'browser-token' }, { status: 201 })
    )
    const first = renderHook(() => useWorkspaceSession())
    await waitFor(() => expect(first.result.current.session?.token).toBe('browser-token'))
    expect(workspaceStore.active()?.type).toBe('BROWSER')
    first.unmount()

    workspaceStore.saveWorkshop('ABCD1234', workshopSession)
    expect(workspaceStore.active()?.type).toBe('WORKSHOP')

    // The second page view shares the memoized bootstrap and still makes it current.
    const second = renderHook(() => useWorkspaceSession())
    await waitFor(() =>
      expect(second.result.current.session?.token).toBe('browser-token')
    )
    expect(workspaceStore.active()?.type).toBe('BROWSER')
    expect(callsTo(fetchMock, '/api/workspaces', 'POST')).toHaveLength(1)
  })

  it('remembers a workspace minted after the page was left without activating it', async () => {
    let release: () => void = () => undefined
    const minted = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await minted
        return jsonResponse({ workspace, token: 'browser-token' }, { status: 201 })
      })
    )
    const { unmount } = renderHook(() => useWorkspaceSession())
    // The participant moved on to a workshop while the mint was still in flight.
    unmount()
    workspaceStore.saveWorkshop('ABCD1234', workshopSession)
    release()

    await expect(ensureWorkspaceSession()).resolves.toMatchObject({
      token: 'browser-token'
    })
    expect(workspaceStore.browser()?.token).toBe('browser-token')
    expect(workspaceStore.active()?.type).toBe('WORKSHOP')
  })
})
