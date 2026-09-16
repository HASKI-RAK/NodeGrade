import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiRequest } from '@/api/http'

import { AdminPage } from './AdminPage'

vi.mock('@/api/http', () => ({ apiRequest: vi.fn() }))

const provider = {
  id: 'provider-id',
  key: 'openai',
  type: 'OPENAI' as const,
  displayName: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  hasApiKey: true,
  apiKeyHint: '••••cret'
}

const renderProviders = () =>
  render(
    <MemoryRouter initialEntries={['/admin/providers']}>
      <AdminPage />
    </MemoryRouter>
  )

describe('provider administration', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === '/admin/auth/session')
        return {
          data: { enabled: true, authenticated: true },
          response: new Response()
        }
      if (path === '/admin/providers' && options?.method !== 'POST')
        return { data: { providers: [provider] }, response: new Response() }
      return { data: { provider }, response: new Response() }
    })
  })

  it('renders provider navigation and preserves a stored key on ordinary save', async () => {
    renderProviders()
    expect(await screen.findByRole('heading', { name: 'LLM providers' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Workshops' })).toHaveAttribute(
      'href',
      '/admin/workshops'
    )
    expect(screen.getByRole('link', { name: 'Providers' })).toHaveAttribute(
      'href',
      '/admin/providers'
    )
    await screen.findByRole('heading', { name: 'OpenAI' })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/providers/provider-id',
        expect.objectContaining({
          method: 'PUT',
          body: expect.objectContaining({ credential: { mode: 'KEEP' } })
        })
      )
    )
  })

  it('sends explicit credential removal when selected', async () => {
    renderProviders()
    await screen.findByRole('heading', { name: 'OpenAI' })

    await userEvent.click(screen.getByLabelText('Remove stored API key'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/providers/provider-id',
        expect.objectContaining({
          body: expect.objectContaining({ credential: { mode: 'REMOVE' } })
        })
      )
    )
  })
})
