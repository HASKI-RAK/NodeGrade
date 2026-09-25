import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetWorkspaceSession } from '@/store/workspaceSession'
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
      { path: '/workshop/:code', element: probe },
      { path: '/editor/:workflowId', element: probe }
    ],
    { initialEntries: ['/'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('start page', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers all four entry actions (AC-001)', async () => {
    stubApi(() => jsonResponse({ workspace, token: 'tok' }))
    renderStart()

    expect(await screen.findByRole('heading', { name: 'Start workshop' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'New workflow' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open workflow' })).toHaveAttribute(
      'href',
      '/workflows'
    )
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/templates'
    )
  })

  it('sends an entered code to the join flow in normalized form (AC-006)', async () => {
    stubApi(() => jsonResponse({ workspace, token: 'tok' }))
    const router = renderStart()

    await userEvent.type(screen.getByLabelText('Workshop code'), 'abcd-efgh')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/workshop/ABCDEFGH'))
  })

  it('refuses a code with nothing in it and stays put (AC-006)', async () => {
    stubApi(() => jsonResponse({ workspace, token: 'tok' }))
    const router = renderStart()

    await userEvent.type(screen.getByLabelText('Workshop code'), '--')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(
      await screen.findByText('Enter the workshop code from your handout.')
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
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
    const [, createInit] = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/api/workflows') && init?.method === 'POST'
    ) as [string, RequestInit]
    expect(authorizationOf(createInit)).toBe('Bearer tok')
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

  it('offers the appearance picker without a provider', async () => {
    stubApi(() => jsonResponse({ workspace, token: 'tok' }))
    renderStart()

    await screen.findByRole('heading', { name: 'Start workshop' })
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('menuitem', { name: /System/ })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: /Light/ })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: /Dark/ })).toBeVisible()
  })
})
