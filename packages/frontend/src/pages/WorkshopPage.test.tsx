import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { workspaceStore } from '@/store/workspaceStore'
import { stubApi } from '@/test/apiStub'

import { WorkshopPage } from './WorkshopPage'

const probe = <div data-testid="probe" />

const renderHub = () => {
  const router = createMemoryRouter(
    [
      { path: '/workshop', element: <WorkshopPage /> },
      { path: '/workshop/:code', element: probe }
    ],
    { initialEntries: ['/workshop'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

const joined = (code: string, title: string) =>
  workspaceStore.saveWorkshop(code, {
    id: `ws-${code}`,
    type: 'WORKSHOP',
    label: title,
    workshopId: `shop-${code}`,
    workshop: { code, title, readOnly: false },
    token: `tok-${code}`
  })

describe('workshop hub', () => {
  let fetchMock: ReturnType<typeof stubApi>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = stubApi(() => {
      throw new Error('the workshop hub makes no request')
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers the code entry and explains what a code is (FR-008)', async () => {
    renderHub()

    expect(await screen.findByRole('heading', { name: 'Start workshop' })).toBeVisible()
    expect(screen.getByTestId('workshop-code')).toBeVisible()
    expect(screen.getByTestId('join-workshop')).toHaveTextContent('Join')
    expect(screen.getByText(/A workshop code is the eight-character code/)).toBeVisible()
    expect(screen.queryByText('Continue where you left off')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends an entered code to the join flow in normalized form (AC-006)', async () => {
    const router = renderHub()

    await userEvent.type(screen.getByLabelText('Workshop code'), 'abcd-efgh')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/workshop/ABCDEFGH'))
  })

  it('refuses a code with nothing in it and stays put (AC-006)', async () => {
    const router = renderHub()

    await userEvent.type(screen.getByLabelText('Workshop code'), '--')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(
      await screen.findByText('Enter the workshop code from your handout.')
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/workshop')
  })

  it('offers the way back to the workshop joined last in this browser (FR-008)', async () => {
    joined('AAAA-1111', 'First workshop')
    joined('BBBB-2222', 'Three exercises')
    // The start page made the browser workspace active since; the way back survives it.
    workspaceStore.activate({
      id: 'ws-browser',
      type: 'BROWSER',
      label: null,
      workshopId: null,
      token: 'browser-token'
    })
    renderHub()

    expect(await screen.findByText('Continue where you left off')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Three exercises' })).toHaveAttribute(
      'href',
      '/workshop/BBBB2222'
    )
    expect(screen.queryByRole('link', { name: 'First workshop' })).toBeNull()
  })
})
