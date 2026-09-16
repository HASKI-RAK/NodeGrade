import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '@/routes'
import { resetWorkspaceSession } from '@/store/workspaceSession'
import { jsonResponse, stubApi } from '@/test/apiStub'

const renderAt = (entry: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return router
}

describe('application routes', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
    stubApi(() =>
      jsonResponse({
        workspace: { id: 'ws-1', type: 'BROWSER', label: null, workshopId: null },
        token: 'tok'
      })
    )
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
  })

  it('sends an editor URL without a workflow to the start page (FR-005)', async () => {
    const router = renderAt('/editor')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'NodeGrade' })).toBeVisible()
  })
})
