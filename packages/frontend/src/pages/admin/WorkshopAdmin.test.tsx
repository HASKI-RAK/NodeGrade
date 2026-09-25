import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse, stubApi } from '@/test/apiStub'

import { WorkshopAdmin } from './WorkshopAdmin'

const workshop = {
  id: 'shop-1',
  title: 'WAIE workshop',
  code: 'ABCD-EFGH',
  status: 'PUBLISHED',
  templates: [
    {
      id: 'entry-1',
      templateId: 'tpl-1',
      templateName: 'Exercise one',
      mode: 'PINNED',
      templateRevisionId: 'rev-1-2',
      revision: 2,
      currentRevision: 3,
      published: true,
      deleted: false
    },
    {
      id: 'entry-2',
      templateId: 'tpl-2',
      templateName: 'Exercise two',
      mode: 'LATEST',
      templateRevisionId: null,
      revision: null,
      currentRevision: 5,
      published: false,
      deleted: false
    }
  ]
}

const templates = [
  { id: 'tpl-1', name: 'Exercise one', published: true },
  { id: 'tpl-2', name: 'Exercise two', published: false },
  { id: 'tpl-3', name: 'Exercise three', published: true }
]

const readiness = {
  status: 'PASS',
  checks: [
    {
      id: 'backend',
      label: 'Backend',
      status: 'PASS',
      detail: 'The backend answered this request.'
    },
    {
      id: 'templates',
      label: 'Workshop templates',
      status: 'PASS',
      detail: '1 of 2 template(s) ready.'
    }
  ],
  entries: [
    {
      entryId: 'entry-2',
      templateName: 'Exercise two',
      status: 'FAIL',
      checks: [
        {
          id: 'models',
          label: 'Provider and models',
          status: 'FAIL',
          detail: 'No provider is reachable (OpenAI: UNREACHABLE).'
        }
      ]
    }
  ]
}

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as unknown

describe('workshop administration', () => {
  let fetchMock: ReturnType<typeof stubApi>

  beforeEach(() => {
    fetchMock = stubApi((url, init) => {
      if (url.endsWith('/admin/workshops') && init.method === 'POST')
        return jsonResponse({ workshop })
      if (url.endsWith('/admin/workshops')) return jsonResponse({ workshops: [workshop] })
      if (url.endsWith('/admin/templates?kind=WORKFLOW'))
        return jsonResponse({ templates })
      const revisions = /\/admin\/templates\/(tpl-\d)$/.exec(url)
      if (revisions)
        return jsonResponse({
          revisions: [1, 2].map((revision) => ({
            id: `rev-${revisions[1].slice(4)}-${revision}`,
            name: 'Exercise',
            revision
          }))
        })
      if (url.endsWith('/readiness')) return jsonResponse(readiness)
      if (url.endsWith('/templates') && init.method === 'PUT')
        return jsonResponse({ workshop })
      return jsonResponse({})
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists each workshop with its templates and how they pick a revision', async () => {
    render(<WorkshopAdmin />)

    const offered = await screen.findByLabelText('Offered templates')
    expect(offered).toHaveTextContent('Exercise one — pinned to r2')
    expect(offered).toHaveTextContent(
      'Exercise two — newest revision (currently r5) (template unpublished)'
    )
  })

  it('creates a workshop from several templates (SPEC-0022/AC-001)', async () => {
    const user = userEvent.setup()
    render(<WorkshopAdmin />)
    const editor = await screen.findByLabelText('Workshop templates')
    await waitFor(() =>
      expect(within(editor).getByLabelText('Template 1')).toHaveTextContent(
        'Exercise one'
      )
    )

    await user.click(within(editor).getByRole('button', { name: 'Add template' }))
    await user.click(within(editor).getAllByLabelText('Version')[0])
    await user.click(await screen.findByRole('option', { name: 'Revision 2' }))
    await user.click(screen.getByRole('button', { name: 'Create workshop' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
      ).toHaveLength(1)
    )
    const [, init] = fetchMock.mock.calls.find(([, call]) => call?.method === 'POST')!
    expect(bodyOf(init as RequestInit)).toEqual({
      title: 'WAIE workshop',
      templates: [
        { templateId: 'tpl-1', templateRevisionId: 'rev-1-2' },
        { templateId: 'tpl-2', templateRevisionId: null }
      ]
    })
  })

  it('warns when an unpublished template follows the newest revision', async () => {
    const user = userEvent.setup()
    render(<WorkshopAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit templates' }))

    expect(await screen.findByText(/“Exercise two” is not published/)).toBeVisible()
  })

  it('saves reordered templates of an existing workshop', async () => {
    const user = userEvent.setup()
    render(<WorkshopAdmin />)
    await user.click(await screen.findByRole('button', { name: 'Edit templates' }))
    await user.click(screen.getByRole('button', { name: 'Move template 2 up' }))
    await user.click(screen.getByRole('button', { name: 'Save templates' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
      ).toHaveLength(1)
    )
    const [url, init] = fetchMock.mock.calls.find(([, call]) => call?.method === 'PUT')!
    expect(String(url)).toBe('/api/admin/workshops/shop-1/templates')
    expect(bodyOf(init as RequestInit)).toEqual({
      templates: [
        { templateId: 'tpl-2', templateRevisionId: null },
        { templateId: 'tpl-1', templateRevisionId: 'rev-1-2' }
      ]
    })
  })

  it('shows readiness per workshop and per template (AC-008, SPEC-0022/AC-013)', async () => {
    const user = userEvent.setup()
    render(<WorkshopAdmin />)

    await user.click(await screen.findByRole('button', { name: 'Check readiness' }))

    const panel = await screen.findByLabelText('Workshop readiness')
    expect(panel).toHaveTextContent('Backend: The backend answered this request.')
    expect(panel).toHaveTextContent('Workshop templates: 1 of 2 template(s) ready.')
    expect(screen.getByLabelText('Readiness of Exercise two')).toHaveTextContent(
      'Provider and models: No provider is reachable (OpenAI: UNREACHABLE).'
    )
    expect(panel).toHaveTextContent('Pass')
    expect(panel).toHaveTextContent('Fail')
  })
})
