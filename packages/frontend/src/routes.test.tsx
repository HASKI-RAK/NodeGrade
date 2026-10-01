import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '@/routes'
import { resetWorkspaceSession } from '@/store/workspaceSession'
import { workspaceStore } from '@/store/workspaceStore'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

const workspace = { id: 'ws-1', type: 'BROWSER', label: null, workshopId: null }

const mine = { id: 'wf-mine', name: 'Mine', slug: 'mine', version: 1 }

const workshop = { code: 'ABCD-1234', title: 'Three exercises', readOnly: false }
const workshopWorkspace = {
  id: 'ws-2',
  type: 'WORKSHOP',
  label: workshop.title,
  workshopId: 'shop-1',
  workshop
}

const renderAt = (entry: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return router
}

const titleBar = () => screen.queryByRole('navigation', { name: 'Main' })

const callsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix))

describe('application routes', () => {
  let fetchMock: ReturnType<typeof stubApi>

  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
    fetchMock = stubApi((url, init) => {
      if (url.endsWith('/api/workspaces') && init.method === 'POST')
        return jsonResponse({ workspace, token: 'tok' }, { status: 201 })
      if (url.endsWith('/api/templates?kind=WORKFLOW'))
        return jsonResponse({ templates: [] })
      if (url.endsWith('/api/workflows')) return jsonResponse({ workflows: [] })
      return jsonResponse({})
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers an unknown route with a way back to the start page (AC-005)', async () => {
    renderAt('/does-not-exist')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to start' })).toHaveAttribute(
      'href',
      '/'
    )
    expect(titleBar()).not.toBeNull()
  })

  it('renders the start page under the title bar (AC-001, FR-007)', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'NodeGrade' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'New workflow' })).toBeVisible()
    expect(within(titleBar()!).getByRole('link', { name: 'Workshop' })).toHaveAttribute(
      'href',
      '/workshop'
    )
  })

  it('sends an editor URL without a workflow to the start page (FR-005)', async () => {
    const router = renderAt('/editor')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'NodeGrade' })).toBeVisible()
  })

  it('sends an editor URL without any session to the start page (FR-005)', async () => {
    const router = renderAt('/editor/wf-1')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('offers the workshop code on the hub (FR-008)', async () => {
    renderAt('/workshop')

    expect(await screen.findByRole('heading', { name: 'Start workshop' })).toBeVisible()
    expect(screen.getByTestId('workshop-code')).toBeVisible()
    expect(within(titleBar()!).getByRole('link', { name: 'Workshop' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it.each([
    ['/workflows', 'My workflows'],
    ['/templates', 'Templates']
  ])('renders %s as a page of its own (FR-003a, FR-004)', async (path, heading) => {
    const router = renderAt(path)

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeVisible()
    expect(router.state.location.pathname).toBe(path)
  })

  it('opens a browser workflow with the browser token after a workshop visit (business rule)', async () => {
    const user = userEvent.setup()
    fetchMock = stubApi((url, init) => {
      const token = authorizationOf(init)
      if (url.endsWith('/api/workspaces') && init.method === 'POST')
        return jsonResponse({ workspace, token: 'browser-token' }, { status: 201 })
      if (url.endsWith('/preflight')) return jsonResponse({ status: 'PASS', checks: [] })
      if (url.endsWith('/join'))
        return jsonResponse({
          workspace: workshopWorkspace,
          token: 'workshop-token',
          workflow: null,
          autoStarted: false
        })
      if (url.endsWith('/api/workshops/current'))
        return jsonResponse({ workshop, entries: [] })
      if (url.endsWith('/api/workflows'))
        return jsonResponse({ workflows: token === 'Bearer browser-token' ? [mine] : [] })
      if (url.endsWith('/api/workflows/wf-mine'))
        return token === 'Bearer browser-token'
          ? jsonResponse({ ...mine, content: '{"nodes":[],"links":[]}' })
          : jsonResponse(
              { code: 'workflow_not_found', message: 'Workflow not found.' },
              { status: 404 }
            )
      return jsonResponse({})
    })
    const router = renderAt('/')
    await screen.findByRole('button', { name: 'New workflow' })
    await waitFor(() => expect(workspaceStore.active()?.type).toBe('BROWSER'))

    // The hub joins the workshop, and the workshop route makes its session active.
    await user.click(within(titleBar()!).getByRole('link', { name: 'Workshop' }))
    await user.type(screen.getByTestId('workshop-code'), workshop.code)
    await user.click(screen.getByTestId('join-workshop'))
    expect(await screen.findByRole('heading', { name: workshop.title })).toBeVisible()
    expect(workspaceStore.active()?.type).toBe('WORKSHOP')

    // Back on a direct-entry page the browser session is current again: the list is the
    // browser's, and so is the credential the editor opens its workflow with.
    await user.click(within(titleBar()!).getByRole('link', { name: 'Workflows' }))
    await user.click(await screen.findByText('Mine'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-mine'))
    await waitFor(() =>
      expect(callsTo(fetchMock, '/api/workflows/wf-mine')).toHaveLength(1)
    )
    const [[, openInit]] = callsTo(fetchMock, '/api/workflows/wf-mine')
    expect(authorizationOf(openInit as RequestInit)).toBe('Bearer browser-token')
    expect(workspaceStore.active()?.type).toBe('BROWSER')
  })

  it('keeps the LTI registration popup free of the title bar', async () => {
    renderAt('/lti/register')

    expect(await screen.findByText(/Please wait while we register/)).toBeVisible()
    expect(titleBar()).toBeNull()
  })
})
