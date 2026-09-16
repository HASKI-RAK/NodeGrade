import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetWorkspaceSession } from '@/store/workspaceSession'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

import { WorkflowListPage } from './WorkflowListPage'

const workspace = { id: 'ws-1', type: 'BROWSER' as const, label: null, workshopId: null }

describe('my workflows', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the workspace the token resolves to, and nothing else (AC-004)', async () => {
    const fetchMock = stubApi((url, init) => {
      if (url.endsWith('/api/workspaces') && init.method === 'POST')
        return jsonResponse({ workspace, token: 'tok' })
      if (url.endsWith('/api/workflows'))
        return jsonResponse({
          workflows: [{ id: 'wf-1', name: 'Mine', slug: 'mine', version: 3 }]
        })
      throw new Error(`unexpected request: ${url}`)
    })
    render(
      <MemoryRouter>
        <WorkflowListPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Mine')).toBeVisible()
    const [, listInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/workflows') && init?.method === undefined
    ) as [string, RequestInit]
    // Scoping is the server's job; the client's part of it is presenting the token.
    expect(authorizationOf(listInit)).toBe('Bearer tok')
  })

  it('says so when the workspace holds nothing yet', async () => {
    stubApi((url, init) =>
      url.endsWith('/api/workspaces') && init.method === 'POST'
        ? jsonResponse({ workspace, token: 'tok' })
        : jsonResponse({ workflows: [] })
    )
    render(
      <MemoryRouter>
        <WorkflowListPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('No workflows yet.')).toBeVisible())
  })
})
