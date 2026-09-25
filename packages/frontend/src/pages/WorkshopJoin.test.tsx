import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentWorkshop, WorkshopEntry, WorkshopReadiness } from '@/api/http'
import { workspaceStore } from '@/store/workspaceStore'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

import { WorkshopJoin } from './WorkshopJoin'

const workspace = {
  id: 'ws-2',
  type: 'WORKSHOP' as const,
  label: 'WAIE',
  workshopId: 'shop-1',
  workshop: { code: 'ABCD-EFGH', title: 'WAIE', readOnly: false }
}

const joinedSingle = {
  workspace,
  token: 'workshop-token',
  workflow: {
    id: 'wf-9',
    name: 'Rubric assessment',
    slug: 'rubric-assessment',
    version: 1
  },
  autoStarted: true
}

const joinedMany = { ...joinedSingle, workflow: null, autoStarted: false }

const entry = (id: string, overrides: Partial<WorkshopEntry> = {}): WorkshopEntry => ({
  id,
  name: `Exercise ${id}`,
  description: 'Uses rubric-based scoring.',
  category: 'Workshop',
  tags: ['Rubric'],
  mode: 'PINNED',
  revision: 1,
  available: true,
  unavailableReason: null,
  myWorkflowId: null,
  ...overrides
})

const current = (entries: WorkshopEntry[], readOnly = false): CurrentWorkshop => ({
  workshop: { code: 'ABCD-EFGH', title: 'Three exercises', readOnly },
  entries
})

const ready: WorkshopReadiness = {
  status: 'PASS',
  checks: [
    {
      id: 'templates',
      label: 'Workshop templates',
      status: 'PASS',
      detail: '3 of 3 template(s) ready.'
    }
  ]
}

const callsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix))

/** Answers the participant API for a workshop with the given overview. */
const stubWorkshop = ({
  join = joinedMany,
  overview = current([entry('a'), entry('b')]),
  workflows = []
}: {
  join?: unknown
  overview?: CurrentWorkshop
  workflows?: unknown[]
} = {}) =>
  stubApi((url) => {
    if (url.endsWith('/preflight')) return jsonResponse(ready)
    if (url.endsWith('/join')) return jsonResponse(join)
    if (url.endsWith('/workshops/current')) return jsonResponse(overview)
    if (url.endsWith('/workflows')) return jsonResponse({ workflows })
    if (url.endsWith('/structure'))
      return jsonResponse({
        entryId: 'a',
        name: 'Exercise a',
        revision: 1,
        content: JSON.stringify({ nodes: [{ id: 1, type: 'input/answer' }], links: [] })
      })
    if (url.endsWith('/start'))
      return jsonResponse({
        workflow: { id: 'wf-started', name: 'Exercise', slug: 'exercise', version: 1 },
        created: true
      })
    return jsonResponse({}, { status: 500 })
  })

const renderJoin = (path: string) => {
  const router = createMemoryRouter(
    [
      { path: '/workshop/:code', element: <WorkshopJoin /> },
      { path: '/editor/:workflowId', element: <div data-testid="probe" /> },
      { path: '/', element: <div data-testid="start" /> }
    ],
    { initialEntries: [path] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('workshop deep link', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the copy of a single-entry workshop directly (SPEC-0022/AC-005)', async () => {
    const fetchMock = stubWorkshop({ join: joinedSingle })
    const router = renderJoin('/workshop/abcd-efgh')

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-9'))
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/workshops/by-code/ABCDEFGH/preflight'
    )
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      '/api/workshops/by-code/ABCDEFGH/join'
    )
    expect(workspaceStore.workshop('ABCDEFGH')?.token).toBe('workshop-token')
    expect(workspaceStore.active()?.workshop?.code).toBe('ABCD-EFGH')
  })

  it('shows the overview of a workshop with several entries (SPEC-0022/AC-006)', async () => {
    const fetchMock = stubWorkshop({
      overview: current([
        entry('a'),
        entry('b', {
          available: false,
          unavailableReason: 'The template is not published.'
        })
      ])
    })
    renderJoin('/workshop/ABCDEFGH')

    expect(await screen.findByRole('heading', { name: 'Three exercises' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Exercise a' })).toBeVisible()
    expect(
      screen.getByText('Not available right now: The template is not published.')
    ).toBeVisible()
    const starts = screen.getAllByRole('button', { name: 'Start' })
    expect(starts[0]).toBeEnabled()
    expect(starts[1]).toBeDisabled()
    expect(
      authorizationOf(callsTo(fetchMock, '/workshops/current')[0][1] as RequestInit)
    ).toBe('Bearer workshop-token')
  })

  it('starts an entry once, however often it is clicked (SPEC-0022/AC-007)', async () => {
    const fetchMock = stubWorkshop()
    const router = renderJoin('/workshop/ABCDEFGH')
    // The second click lands on a button the first one disabled.
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    const [start] = await screen.findAllByRole('button', { name: 'Start' })
    await user.click(start)
    await user.click(start)

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-started'))
    expect(callsTo(fetchMock, '/entries/a/start')).toHaveLength(1)
  })

  it('returns to the overview with the stored token, without joining again', async () => {
    workspaceStore.saveWorkshop('ABCDEFGH', { ...workspace, token: 'workshop-token' })
    const fetchMock = stubWorkshop({
      overview: current([entry('a', { myWorkflowId: 'wf-mine' })]),
      workflows: [{ id: 'wf-mine', name: 'My copy', version: 4 }]
    })
    renderJoin('/workshop/ABCDEFGH')

    const continueLink = await screen.findByRole('link', { name: 'Continue' })
    expect(continueLink).toHaveAttribute('href', '/editor/wf-mine')
    expect(
      within(screen.getByRole('list', { name: 'My workflows' })).getByText('My copy')
    ).toBeVisible()
    expect(callsTo(fetchMock, '/join')).toHaveLength(0)
    expect(callsTo(fetchMock, '/preflight')).toHaveLength(0)
  })

  it('shows a closed workshop read-only to a returning participant (SPEC-0022/FR-017)', async () => {
    workspaceStore.saveWorkshop('ABCDEFGH', { ...workspace, token: 'workshop-token' })
    stubWorkshop({ overview: current([entry('a')], true) })
    renderJoin('/workshop/ABCDEFGH')

    expect(await screen.findByText(/This workshop has ended/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(workspaceStore.active()?.workshop?.readOnly).toBe(true)
  })

  it('joins afresh when the stored token is no longer valid', async () => {
    workspaceStore.saveWorkshop('ABCDEFGH', { ...workspace, token: 'stale-token' })
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith('/preflight')) return jsonResponse(ready)
      if (url.endsWith('/join')) return jsonResponse(joinedSingle)
      if (authorizationOf(init) === 'Bearer stale-token')
        return jsonResponse({ code: 'workspace_token_invalid' }, { status: 401 })
      return jsonResponse({ workflows: [] })
    })
    const router = renderJoin('/workshop/ABCDEFGH')

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-9'))
    expect(callsTo(fetchMock, '/join')).toHaveLength(1)
    expect(workspaceStore.workshop('ABCDEFGH')?.token).toBe('workshop-token')
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
              {
                id: 'templates',
                label: 'Workshop templates',
                status: 'FAIL',
                detail: 'No template is ready.'
              }
            ]
          })
        : jsonResponse(joinedSingle)
    )
    const router = renderJoin('/workshop/ABCDEFGH')

    expect(
      await screen.findByRole('heading', { name: 'Workshop not ready' })
    ).toBeVisible()
    expect(screen.getByText('Workshop templates: No template is ready.')).toBeVisible()
    expect(router.state.location.pathname).toBe('/workshop/ABCDEFGH')
    expect(callsTo(fetchMock, '/join')).toHaveLength(0)
  })

  it('offers a retry when the server cannot be reached', async () => {
    let attempts = 0
    stubApi((url) => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return url.endsWith('/preflight') ? jsonResponse(ready) : jsonResponse(joinedSingle)
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

  it('previews the structure an entry hands out', async () => {
    stubWorkshop()
    renderJoin('/workshop/ABCDEFGH')
    const user = userEvent.setup()

    const [preview] = await screen.findAllByRole('button', { name: 'Preview structure' })
    await user.click(preview)

    expect(await screen.findByText('1 nodes · 0 connections')).toBeVisible()
  })
})
