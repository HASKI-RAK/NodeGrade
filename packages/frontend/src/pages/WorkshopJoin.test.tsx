import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkshopReadiness } from '@/api/http'
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

const ready: WorkshopReadiness = {
  status: 'PASS',
  checks: [
    {
      id: 'models',
      label: 'Provider and models',
      status: 'PASS',
      detail: '3 model(s) available from OpenAI.'
    }
  ]
}

/** Answers the preflight, then hands every later call to the join handler. */
const stubJoin = (join: (url: string, init: RequestInit) => Response) =>
  stubApi((url, init) =>
    url.endsWith('/preflight') ? jsonResponse(ready) : join(url, init)
  )

const callsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix))

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
    const fetchMock = stubJoin(() => jsonResponse(joined))
    const router = renderJoin('/workshop/abcd-efgh')

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-9'))
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/workshops/by-code/ABCDEFGH/preflight'
    )
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      '/api/workshops/by-code/ABCDEFGH/join'
    )
    expect(workspaceStore.workshop('ABCDEFGH')?.token).toBe('workshop-token')
  })

  it('presents the joined workspace token on a return visit', async () => {
    workspaceStore.saveWorkshop('ABCDEFGH', {
      ...joined.workspace,
      token: 'workshop-token'
    })
    const fetchMock = stubJoin(() => jsonResponse(joined))
    renderJoin('/workshop/ABCDEFGH')

    await waitFor(() => expect(callsTo(fetchMock, '/join')).toHaveLength(1))
    expect(authorizationOf(callsTo(fetchMock, '/join')[0][1] as RequestInit)).toBe(
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

  it('does not start a participant into a workshop that fails preflight (AC-007)', async () => {
    const fetchMock = stubApi((url) =>
      url.endsWith('/preflight')
        ? jsonResponse({
            status: 'FAIL',
            checks: [
              ...ready.checks.map((check) => ({ ...check, status: 'PASS' })),
              {
                id: 'models',
                label: 'Provider and models',
                status: 'FAIL',
                detail: 'No provider is reachable (OpenAI: UNREACHABLE).'
              }
            ]
          })
        : jsonResponse(joined)
    )
    const router = renderJoin('/workshop/ABCDEFGH')

    expect(
      await screen.findByRole('heading', { name: 'Workshop not ready' })
    ).toBeVisible()
    expect(
      screen.getByText(
        'Provider and models: No provider is reachable (OpenAI: UNREACHABLE).'
      )
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/workshop/ABCDEFGH')
    expect(callsTo(fetchMock, '/join')).toHaveLength(0)
  })

  it('offers a retry when the server cannot be reached', async () => {
    let attempts = 0
    stubApi((url) => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return url.endsWith('/preflight') ? jsonResponse(ready) : jsonResponse(joined)
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
