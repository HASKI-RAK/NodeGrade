import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetWorkspaceSession } from '@/store/workspaceSession'
import { workspaceStore } from '@/store/workspaceStore'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

import { StartPage } from './StartPage'

const workspace = {
  id: 'ws-1',
  type: 'BROWSER' as const,
  label: null,
  workshopId: null
}

const probe = <div data-testid="probe" />

const renderStart = () => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <StartPage /> },
      { path: '/workshop', element: probe },
      { path: '/editor/:workflowId', element: probe }
    ],
    { initialEntries: ['/'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

const callsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith(suffix) && (init?.method ?? 'GET') === method
  )

describe('start page', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers the three entry actions and points participants to the workshop hub (AC-001)', async () => {
    stubApi(() => jsonResponse({ workspace, token: 'tok' }, { status: 201 }))
    renderStart()

    expect(await screen.findByRole('heading', { name: 'Get started' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'New workflow' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'My workflows' })).toHaveAttribute(
      'href',
      '/workflows'
    )
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/templates'
    )
    expect(screen.getByRole('link', { name: 'workshop page' })).toHaveAttribute(
      'href',
      '/workshop'
    )
    expect(screen.queryByTestId('workshop-code')).toBeNull()
  })

  it('mints a browser workspace once and keeps it as the active session (FR-001)', async () => {
    const fetchMock = stubApi(() => jsonResponse({ workspace, token: 'tok' }))
    renderStart()

    await waitFor(() => expect(workspaceStore.browser()?.token).toBe('tok'))
    expect(workspaceStore.active()?.type).toBe('BROWSER')
    expect(callsTo(fetchMock, '/api/workspaces', 'POST')).toHaveLength(1)
  })

  it('creates a workflow in the established workspace and opens it (AC-003)', async () => {
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith('/api/workspaces') && init.method === 'POST')
        return jsonResponse({ workspace, token: 'tok' })
      if (url.endsWith('/api/workflows') && init.method === 'POST')
        return jsonResponse({
          id: 'wf-1',
          name: 'Untitled workflow',
          slug: 'untitled-workflow',
          version: 1
        })
      throw new Error(`unexpected request: ${init.method ?? 'GET'} ${url}`)
    })
    const router = renderStart()

    await userEvent.click(screen.getByRole('button', { name: 'New workflow' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-1'))
    const [[, createInit]] = callsTo(fetchMock, '/api/workflows', 'POST')
    expect(authorizationOf(createInit as RequestInit)).toBe('Bearer tok')
    // One bootstrap for the page and the click together, not one each.
    expect(callsTo(fetchMock, '/api/workspaces', 'POST')).toHaveLength(1)
  })

  it('reuses the workspace this browser already holds instead of minting another', async () => {
    workspaceStore.saveBrowser({ ...workspace, token: 'stored' })
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith('/api/workspaces/me') && authorizationOf(init) === 'Bearer stored')
        return jsonResponse(workspace)
      throw new Error(`unexpected request: ${init.method ?? 'GET'} ${url}`)
    })
    renderStart()

    await screen.findByRole('heading', { name: 'Get started' })
    await waitFor(() => expect(callsTo(fetchMock, '/api/workspaces/me')).toHaveLength(1))
    expect(callsTo(fetchMock, '/api/workspaces', 'POST')).toHaveLength(0)
    expect(workspaceStore.active()?.token).toBe('stored')
  })

  it('replaces a stored token the server no longer honours', async () => {
    workspaceStore.saveBrowser({ ...workspace, id: 'ws-old', token: 'stale' })
    const fetchMock = stubApi((url) =>
      url.endsWith('/api/workspaces/me')
        ? jsonResponse({ code: 'workspace_token_invalid' }, { status: 401 })
        : jsonResponse({ workspace, token: 'fresh' })
    )
    renderStart()

    await waitFor(() => expect(workspaceStore.browser()?.token).toBe('fresh'))
    expect(callsTo(fetchMock, '/api/workspaces', 'POST')).toHaveLength(1)
    expect(workspaceStore.active()?.id).toBe('ws-1')
  })

  it('keeps a stored token when the server fails transiently', async () => {
    workspaceStore.saveBrowser({ ...workspace, id: 'ws-old', token: 'stored' })
    const fetchMock = stubApi((url) =>
      url.endsWith('/api/workspaces/me')
        ? jsonResponse(
            { code: 'server_error', message: 'Workspace store unavailable.' },
            { status: 500 }
          )
        : jsonResponse({ workspace, token: 'fresh' })
    )
    renderStart()

    expect(await screen.findByText('Workspace store unavailable.')).toBeVisible()
    expect(callsTo(fetchMock, '/api/workspaces', 'POST')).toHaveLength(0)
    expect(workspaceStore.browser()?.token).toBe('stored')
  })

  it('surfaces a failed workspace bootstrap and recovers on retry', async () => {
    let attempts = 0
    stubApi(() => {
      attempts += 1
      return attempts === 1
        ? jsonResponse(
            { code: 'server_error', message: 'Workspace store unavailable.' },
            { status: 500 }
          )
        : jsonResponse({ workspace, token: 'tok' })
    })
    renderStart()

    expect(await screen.findByText('Workspace store unavailable.')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() =>
      expect(screen.queryByText('Workspace store unavailable.')).not.toBeInTheDocument()
    )
  })

  it('shows the throttle refusal in readable form, with the retry (SPEC-0022/FR-015)', async () => {
    stubApi(() =>
      jsonResponse(
        { code: 'too_many_requests', message: 'Too many workspaces from this address.' },
        { status: 429, headers: { 'Retry-After': '30' } }
      )
    )
    renderStart()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many workspaces from this address.')
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('sends the participant to the workshop hub, which holds the code entry (FR-001a)', async () => {
    stubApi(() => jsonResponse({ workspace, token: 'tok' }))
    const router = renderStart()

    await userEvent.click(screen.getByRole('link', { name: 'workshop page' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/workshop'))
  })
})
