import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '@/routes'
import { resetWorkspaceSession } from '@/store/workspaceSession'
import { jsonResponse, stubApi } from '@/test/apiStub'

const workspace = { id: 'ws-1', type: 'BROWSER', label: null, workshopId: null }

const renderAt = (entry: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return router
}

const titleBar = () => screen.queryByRole('navigation', { name: 'Main' })

describe('application routes', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
    stubApi((url, init) => {
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

  it('keeps the LTI registration popup free of the title bar', async () => {
    renderAt('/lti/register')

    expect(await screen.findByText(/Please wait while we register/)).toBeVisible()
    expect(titleBar()).toBeNull()
  })
})
