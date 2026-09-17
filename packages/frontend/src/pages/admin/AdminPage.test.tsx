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
  apiKeyHint: '••••cret',
  policy: { mode: 'ALLOW_ALL' as const, allowedModels: [] as string[] }
}

const catalog = {
  status: 'AVAILABLE',
  models: [
    { modelId: 'gpt-5', label: 'GPT-5', allowed: false },
    { modelId: 'gpt-5-mini', label: 'GPT-5 mini', allowed: false }
  ]
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
      if (path === '/admin/providers/provider-id/models')
        return { data: catalog, response: new Response() }
      if (path === '/admin/execution-limits' && options?.method !== 'PUT')
        return {
          data: { limits: { workspaceConcurrentRuns: 2, providerConcurrentRequests: 8 } },
          response: new Response()
        }
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
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/admin/templates'
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

  it('curates an allowlist from the live catalog and saves it with the provider', async () => {
    renderProviders()
    await screen.findByRole('heading', { name: 'OpenAI' })

    await userEvent.click(screen.getByRole('combobox', { name: 'Model policy' }))
    await userEvent.click(
      screen.getByRole('option', { name: 'Allowlist — only the models I pick' })
    )
    await userEvent.click(await screen.findByRole('checkbox', { name: 'GPT-5' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/providers/provider-id',
        expect.objectContaining({
          method: 'PUT',
          body: expect.objectContaining({
            policy: { mode: 'ALLOWLIST', allowedModels: ['gpt-5'] }
          })
        })
      )
    )
  })

  it('saves the deployment concurrency guards', async () => {
    renderProviders()

    // The fields only render once the stored limits arrive.
    await userEvent.click(await screen.findByRole('button', { name: 'Save limits' }))

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/execution-limits',
        expect.objectContaining({
          method: 'PUT',
          body: { workspaceConcurrentRuns: 2, providerConcurrentRequests: 8 }
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

describe('workshop readiness view', () => {
  const readiness = {
    status: 'FAIL',
    checks: [
      {
        id: 'backend',
        label: 'Backend',
        status: 'PASS',
        detail: 'The backend answered this request.'
      },
      {
        id: 'models',
        label: 'Provider and models',
        status: 'FAIL',
        detail: 'No provider is reachable (OpenAI: UNREACHABLE).'
      }
    ]
  }

  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/admin/auth/session')
        return {
          data: { enabled: true, authenticated: true },
          response: new Response()
        }
      if (path === '/admin/workshops')
        return {
          data: {
            workshops: [
              {
                id: 'shop-1',
                title: 'WAIE workshop',
                code: 'ABCD-EFGH',
                status: 'PUBLISHED'
              }
            ]
          },
          response: new Response()
        }
      if (path === '/admin/templates')
        return {
          data: { templates: [{ id: 'tpl-1', name: 'WAIE free-text assessment' }] },
          response: new Response()
        }
      if (path === '/admin/templates/tpl-1')
        return {
          data: { revisions: [{ id: 'rev-1', name: 'WAIE', revision: 1 }] },
          response: new Response()
        }
      if (path === '/admin/workshops/shop-1/readiness')
        return { data: readiness, response: new Response() }
      return { data: {}, response: new Response() }
    })
  })

  it('shows every preflight check with its pass or fail state (AC-008)', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/workshops']}>
        <AdminPage />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'WAIE workshop' })

    await userEvent.click(screen.getByRole('button', { name: 'Check readiness' }))

    const panel = await screen.findByLabelText('Workshop readiness')
    expect(panel).toHaveTextContent('Backend: The backend answered this request.')
    expect(panel).toHaveTextContent(
      'Provider and models: No provider is reachable (OpenAI: UNREACHABLE).'
    )
    expect(panel).toHaveTextContent('Pass')
    expect(panel).toHaveTextContent('Fail')
  })
})
