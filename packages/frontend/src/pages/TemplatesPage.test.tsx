import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowTemplate } from '@/api/http'
import { resetWorkspaceSession } from '@/store/workspaceSession'
import { authorizationOf, jsonResponse, stubApi } from '@/test/apiStub'

import { TemplatesPage } from './TemplatesPage'

const workspace = { id: 'ws-1', type: 'BROWSER' as const, label: null, workshopId: null }

const template = (slug: string, name: string): WorkflowTemplate => ({
  id: `template-${slug}`,
  slug,
  kind: 'WORKFLOW',
  name,
  description:
    'Methods: (1) Expected-words check; (2) Embedding similarity to a reference with cosine similarity.',
  category: 'Workshop',
  tags: ['keyword', 'similarity'],
  currentRevision: 1
})

const templates = [
  template('workshop-words-vs-understanding', 'Workshop 1 · Day and night'),
  template('waie-assessment', 'WAIE assessment')
]

/** Answers the gallery API for a browser workspace minted on the spot. */
const stubGallery = (published: WorkflowTemplate[] = templates) =>
  stubApi((url, init) => {
    if (url.endsWith('/api/workspaces') && init.method === 'POST')
      return jsonResponse({ workspace, token: 'tok' }, { status: 201 })
    if (url.endsWith('/api/templates?kind=WORKFLOW'))
      return jsonResponse({ templates: published })
    if (url.includes('/api/templates/'))
      return jsonResponse({
        template: published[0],
        revision: {
          id: 'revision-1',
          revision: 1,
          name: published[0].name,
          description: null,
          category: 'Workshop',
          tags: [],
          content: JSON.stringify({
            nodes: [{ id: 8, type: 'models/llm', title: 'Assessment model' }],
            links: [[1, 1, 0, 8, 0, 'string']]
          }),
          interfaces: null,
          requiredNodeTypes: ['models/llm']
        }
      })
    if (url.endsWith('/api/workflows/from-template') && init.method === 'POST')
      return jsonResponse(
        { id: 'wf-copy', name: 'Workshop 1 · Day and night', slug: 'copy', version: 1 },
        { status: 201, headers: { ETag: 'W/"1"' } }
      )
    throw new Error(`unexpected request: ${init.method ?? 'GET'} ${url}`)
  })

const renderGallery = () => {
  const router = createMemoryRouter(
    [
      { path: '/templates', element: <TemplatesPage /> },
      { path: '/editor/:workflowId', element: <div data-testid="probe" /> }
    ],
    { initialEntries: ['/templates'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('TemplatesPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetWorkspaceSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the published workflow templates with the workspace token (FR-003a)', async () => {
    const fetchMock = stubGallery()
    renderGallery()

    expect(
      await screen.findByRole('article', { name: 'Workshop 1 · Day and night' })
    ).toBeVisible()
    expect(screen.getByRole('article', { name: 'WAIE assessment' })).toBeVisible()
    // Method phrases render bold on the card, and tags surface as chips.
    expect(
      screen.getAllByText('Expected-words check', { selector: 'strong' })
    ).toHaveLength(2)
    expect(screen.getAllByText('keyword')).toHaveLength(2)
    const [, listInit] = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/api/templates?kind=WORKFLOW')
    ) as [string, RequestInit]
    expect(authorizationOf(listInit)).toBe('Bearer tok')
  })

  it('copies a template into the workspace and opens the copy (AC-003a)', async () => {
    const fetchMock = stubGallery()
    const router = renderGallery()
    const card = await screen.findByRole('article', { name: 'WAIE assessment' })

    await userEvent.click(within(card).getByRole('button', { name: 'Use template' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/editor/wf-copy'))
    const [, copyInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/workflows/from-template') && init?.method === 'POST'
    ) as [string, RequestInit]
    expect(authorizationOf(copyInit)).toBe('Bearer tok')
    expect(JSON.parse(String(copyInit.body))).toEqual({ templateSlug: 'waie-assessment' })
  })

  it('opens a structural preview before use', async () => {
    stubGallery()
    renderGallery()

    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Preview structure' }))[0]
    )

    const structure = await screen.findByLabelText('Template structure')
    expect(structure).toHaveTextContent('1 nodes · 1 connections')
    expect(structure).toHaveTextContent('Assessment model')
    expect(structure).toHaveTextContent('models/llm · node 8')
  })

  it('says so when nothing is published', async () => {
    stubGallery([])
    renderGallery()

    expect(await screen.findByText('No templates are published yet.')).toBeVisible()
  })

  it('reports a copy the server refused and keeps the gallery usable', async () => {
    stubApi((url, init) => {
      if (url.endsWith('/api/workspaces') && init.method === 'POST')
        return jsonResponse({ workspace, token: 'tok' })
      if (url.endsWith('/api/templates?kind=WORKFLOW')) return jsonResponse({ templates })
      return jsonResponse(
        { code: 'template_unavailable', message: 'The template is not published.' },
        { status: 404 }
      )
    })
    renderGallery()
    const card = await screen.findByRole('article', { name: 'WAIE assessment' })

    await userEvent.click(within(card).getByRole('button', { name: 'Use template' }))

    expect(await screen.findByText('The template is not published.')).toBeVisible()
    expect(within(card).getByRole('button', { name: 'Use template' })).toBeEnabled()
  })
})
