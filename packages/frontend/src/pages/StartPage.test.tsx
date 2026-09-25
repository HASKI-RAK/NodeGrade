import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { workspaceStore } from '@/store/workspaceStore'
import { stubApi } from '@/test/apiStub'

import { StartPage } from './StartPage'

const probe = <div data-testid="probe" />

const renderStart = () => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <StartPage /> },
      { path: '/workshop/:code', element: probe }
    ],
    { initialEntries: ['/'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('start page', () => {
  let fetchMock: ReturnType<typeof stubApi>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = stubApi(() => {
      throw new Error('the start page makes no request')
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers only the workshop code and the facilitator entry (SPEC-0022/FR-013)', async () => {
    renderStart()

    expect(await screen.findByRole('heading', { name: 'Start workshop' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Facilitator' })).toHaveAttribute(
      'href',
      '/admin'
    )
    expect(screen.queryByRole('button', { name: 'New workflow' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Templates' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open workflow' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends an entered code to the join flow in normalized form (AC-006)', async () => {
    const router = renderStart()

    await userEvent.type(screen.getByLabelText('Workshop code'), 'abcd-efgh')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/workshop/ABCDEFGH'))
  })

  it('refuses a code with nothing in it and stays put (AC-006)', async () => {
    const router = renderStart()

    await userEvent.type(screen.getByLabelText('Workshop code'), '--')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(
      await screen.findByText('Enter the workshop code from your handout.')
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })

  it('offers the way back to a workshop joined in this browser', async () => {
    workspaceStore.saveWorkshop('ABCDEFGH', {
      id: 'ws-1',
      type: 'WORKSHOP',
      label: 'Three exercises',
      workshopId: 'shop-1',
      workshop: { code: 'ABCD-EFGH', title: 'Three exercises', readOnly: false },
      token: 'tok'
    })
    renderStart()

    expect(await screen.findByRole('link', { name: 'Three exercises' })).toHaveAttribute(
      'href',
      '/workshop/ABCDEFGH'
    )
  })

  it('forgets a browser workspace stored before workshops were the only way in', async () => {
    localStorage.setItem(
      'nodegrade.active-workspace',
      JSON.stringify({ id: 'ws-old', type: 'BROWSER', token: 'old' })
    )
    localStorage.setItem('nodegrade.browser-workspace', JSON.stringify({ id: 'ws-old' }))
    renderStart()

    await screen.findByRole('heading', { name: 'Start workshop' })
    expect(screen.queryByText('Continue where you left off')).toBeNull()
    expect(localStorage.getItem('nodegrade.active-workspace')).toBeNull()
    expect(localStorage.getItem('nodegrade.browser-workspace')).toBeNull()
  })

  it('offers the appearance picker without a provider', async () => {
    renderStart()

    await screen.findByRole('heading', { name: 'Start workshop' })
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('menuitem', { name: /System/ })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: /Light/ })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: /Dark/ })).toBeVisible()
  })
})
