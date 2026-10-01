import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'

const page = (title: string) => <h1>{title}</h1>

const renderShell = (entry: string) => {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: page('Start') },
          { path: '/workflows', element: page('Workflows page') },
          { path: '/templates', element: page('Templates page') },
          { path: '/workshop', element: page('Workshop hub') },
          { path: '/workshop/:code', element: page('Workshop overview') },
          { path: '/admin/workshops', element: page('Administration') }
        ]
      }
    ],
    { initialEntries: [entry] }
  )
  render(<RouterProvider router={router} />)
  return router
}

/** A viewport that answers every media query the same way. */
const stubViewport = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    })
  )

describe('AppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers the brand and the four destinations under their names (FR-007)', () => {
    renderShell('/')

    expect(screen.getByRole('link', { name: 'NodeGrade' })).toHaveAttribute('href', '/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'href',
      '/workflows'
    )
    expect(within(nav).getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/templates'
    )
    expect(within(nav).getByRole('link', { name: 'Workshop' })).toHaveAttribute(
      'href',
      '/workshop'
    )
    expect(within(nav).getByRole('link', { name: 'Facilitator' })).toHaveAttribute(
      'href',
      '/admin'
    )
    expect(screen.getByRole('heading', { name: 'Start' })).toBeVisible()
  })

  it('marks the current destination, on its nested routes too', () => {
    renderShell('/workshop/ABCDEFGH')

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Workshop' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(within(nav).getByRole('link', { name: 'Templates' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('navigates through its links and renders the page below the bar', async () => {
    const router = renderShell('/')

    await userEvent.click(screen.getByRole('link', { name: 'Templates' }))

    expect(router.state.location.pathname).toBe('/templates')
    expect(await screen.findByRole('heading', { name: 'Templates page' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('collapses the destinations into a menu on narrow screens', async () => {
    stubViewport(true)
    renderShell('/')

    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Navigation' }))

    expect(screen.getByRole('menuitem', { name: 'Workshop' })).toHaveAttribute(
      'href',
      '/workshop'
    )
    expect(screen.getByRole('menuitem', { name: 'Facilitator' })).toHaveAttribute(
      'href',
      '/admin'
    )
  })

  it('offers the appearance picker without a provider', async () => {
    renderShell('/')

    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }))

    expect(screen.getByRole('menuitem', { name: /System/ })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: /Light/ })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: /Dark/ })).toBeVisible()
  })
})
