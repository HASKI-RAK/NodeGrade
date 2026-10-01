import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetWorkspaceSession } from '@/store/workspaceSession'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

import { WorkflowListPage } from './WorkflowListPage'

const workspace = { id: 'ws-1', type: 'BROWSER' as const, label: null, workshopId: null }

const renderList = () => {
  const router = createMemoryRouter(
    [
      { path: '/workflows', element: <WorkflowListPage /> },
      { path: '/editor/:workflowId', element: <div data-testid="probe" /> }
    ],
    { initialEntries: ['/workflows'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('my workflows', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the workspace the token resolves to, and nothing else (AC-004)', async () => {
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith('/api/workspaces') && init.method === 'POST')
        return jsonResponse({ workspace, token: 'tok' })
      if (url.endsWith('/api/workflows'))
        return jsonResponse({
          workflows: [{ id: 'wf-1', name: 'Mine', slug: 'mine', version: 3 }]
        })
      throw new Error(`unexpected request: ${url}`)
    })
    const router = renderList()

    expect(await screen.findByText('Mine')).toBeVisible()
    const [, listInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/workflows') && init?.method === undefined
    ) as [string, RequestInit]
    // Scoping is the server's job; the client's part of it is presenting the token.
    expect(authorizationOf(listInit)).toBe('Bearer tok')

    await userEvent.click(screen.getByText('Mine'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-1'))
  })

  it('says so when the workspace holds nothing yet', async () => {
    stubApi((url, init) =>
      url.endsWith('/api/workspaces') && init.method === 'POST'
        ? jsonResponse({ workspace, token: 'tok' })
        : jsonResponse({ workflows: [] })
    )
    renderList()

    expect(await screen.findByText(/No workflows yet/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'template' })).toHaveAttribute(
      'href',
      '/templates'
    )
  })

  it('surfaces a failed bootstrap with a retry', async () => {
    let attempts = 0
    stubApi((url) => {
      attempts += 1
      if (attempts === 1)
        return jsonResponse({ message: 'Workspace store unavailable.' }, { status: 500 })
      return url.endsWith('/api/workflows')
        ? jsonResponse({ workflows: [] })
        : jsonResponse({ workspace, token: 'tok' })
    })
    renderList()

    expect(await screen.findByText('Workspace store unavailable.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(/No workflows yet/)).toBeVisible()
  })
})
