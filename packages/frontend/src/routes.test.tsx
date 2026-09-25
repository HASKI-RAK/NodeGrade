import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '@/routes'
import { workspaceStore } from '@/store/workspaceStore'
import { jsonResponse, stubApi } from '@/test/apiStub'

const renderAt = (entry: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return router
}

describe('application routes', () => {
  beforeEach(() => {
    localStorage.clear()
    stubApi(() => jsonResponse({}))
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

  it('sends an editor URL without a workshop session to the start page (SPEC-0022/FR-013)', async () => {
    const router = renderAt('/editor/wf-1')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it.each(['/templates', '/workflows'])(
    'sends %s to the start page without a workshop',
    async (path) => {
      const router = renderAt(path)

      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    }
  )

  it('sends /templates to the overview of the active workshop (SPEC-0022/FR-014)', async () => {
    workspaceStore.saveWorkshop('ABCDEFGH', {
      id: 'ws-1',
      type: 'WORKSHOP',
      label: 'Workshop',
      workshopId: 'shop-1',
      workshop: { code: 'ABCD-EFGH', title: 'Workshop', readOnly: false },
      token: 'tok'
    })
    const router = renderAt('/templates')

    await waitFor(() => expect(router.state.location.pathname).toBe('/workshop/ABCDEFGH'))
  })
})
