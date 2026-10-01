import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '@/routes'
import { jsonResponse, stubApi } from '@/test/apiStub'

/** The server's answer to the editor's first request, and the rest of the editor's reads. */
const stubLaunch = (status: number, message: string) =>
  stubApi((url) => {
    if (url.includes('/api/workflows/wf-1'))
      return jsonResponse({ code: 'lti_session_missing', message }, { status })
    if (url.endsWith('/api/models'))
      return jsonResponse({ models: [], providers: [], defaultModel: null })
    if (url.includes('/api/templates')) return jsonResponse({ templates: [] })
    return jsonResponse({})
  })

const renderAt = (entry: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return router
}

/** The editor runs inside the course page's frame. */
const embed = () => vi.stubGlobal('top', {})

describe('editor', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tells an embedded LTI launch without its cookie to open in its own window (SPEC-0023/FR-004)', async () => {
    embed()
    stubLaunch(401, 'LTI session missing.')
    renderAt('/editor/wf-1?lti=1')

    expect(
      await screen.findByText(/NodeGrade has to open in its own window/)
    ).toBeVisible()
    expect(screen.queryByText('LTI session missing.')).toBeNull()
  })

  it.each([
    ['a launch in its own window', false, 401, 'LTI session missing.'],
    ['an embedded launch the server refused for another reason', true, 403, 'Refused.']
  ])('keeps the server message for %s', async (_label, embedded, status, message) => {
    if (embedded) embed()
    stubLaunch(status, message)
    renderAt('/student/wf-1?lti=1')

    expect(await screen.findByText(message)).toBeVisible()
    expect(screen.queryByText(/open in its own window/)).toBeNull()
  })
})
