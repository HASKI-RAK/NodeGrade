import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetWorkspaceSession } from '@/store/workspaceSession'
import { workspaceStore } from '@/store/workspaceStore'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

import { WorkshopJoin } from './WorkshopJoin'

const joined = {
  workspace: {
    id: 'ws-2',
    type: 'WORKSHOP' as const,
    label: 'WAIE',
    workshopId: 'shop-1'
  },
  token: 'workshop-token',
  workflow: {
    id: 'wf-9',
    name: 'Rubric assessment',
    slug: 'rubric-assessment',
    version: 1
  }
}

const renderJoin = (entry: string) => {
  const router = createMemoryRouter(
    [
      { path: '/workshop/:code', element: <WorkshopJoin /> },
      { path: '/editor/:workflowId', element: <div data-testid="probe" /> },
      { path: '/', element: <div data-testid="start" /> }
    ],
    { initialEntries: [entry] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('workshop deep link', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('joins from the shared code and opens the participant workflow (AC-002)', async () => {
    const fetchMock = stubApi(() => jsonResponse(joined))
    const router = renderJoin('/workshop/abcd-efgh')

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-9'))
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/workshops/by-code/ABCDEFGH/join'
    )
    expect(workspaceStore.workshop('ABCDEFGH')?.token).toBe('workshop-token')
  })

  it('presents the joined workspace token on a return visit', async () => {
    workspaceStore.saveWorkshop('ABCDEFGH', {
      ...joined.workspace,
      token: 'workshop-token'
    })
    const fetchMock = stubApi(() => jsonResponse(joined))
    renderJoin('/workshop/ABCDEFGH')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(authorizationOf(fetchMock.mock.calls[0][1] as RequestInit)).toBe(
      'Bearer workshop-token'
    )
  })

  it('shows a workshop-unavailable state for a closed code (AC-007)', async () => {
    stubApi(() =>
      jsonResponse(
        { code: 'workshop_unavailable', message: 'This workshop is unavailable.' },
        { status: 404 }
      )
    )
    const router = renderJoin('/workshop/CLOSED01')

    expect(
      await screen.findByRole('heading', { name: 'Workshop unavailable' })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/workshop/CLOSED01')

    await userEvent.click(screen.getByRole('link', { name: 'Back to start' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('offers a retry when the server cannot be reached', async () => {
    let attempts = 0
    stubApi(() => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse(joined)
    })
    const router = renderJoin('/workshop/ABCDEFGH')

    expect(
      await screen.findByText(
        'Could not reach the server. Check your connection and try again.'
      )
    ).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-9'))
  })
})
