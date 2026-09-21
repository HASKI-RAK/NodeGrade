import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiRequest } from '@/api/http'

import { TemplateAdmin } from './TemplateAdmin'

vi.mock('@/api/http', () => ({ apiRequest: vi.fn() }))

const template = {
  id: 'template-1',
  slug: 'draft-workflow',
  kind: 'WORKFLOW' as const,
  name: 'Draft workflow',
  description: 'A draft',
  category: 'Workshop',
  tags: [],
  published: false,
  currentRevision: 1
}

describe('TemplateAdmin', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/admin/templates')
        return { data: { templates: [template] }, response: new Response() }
      return { data: {}, response: new Response() }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a template from the form', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TemplateAdmin />)
    await screen.findByRole('heading', { name: 'Draft workflow' })

    // fireEvent sets the whole value in one React update; typing the slug
    // character by character re-renders the MUI form on every keystroke and
    // pushes this test over the default 5s timeout under full-suite load.
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'New workflow' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Slug' }), {
      target: { value: 'new-workflow' }
    })
    await user.click(screen.getByRole('button', { name: 'Create template' }))
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/templates',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ slug: 'new-workflow', published: false })
        })
      )
    )
    // This form renders the heaviest MUI tree in the file and runs slowest
    // under full-suite load, so it gets headroom above the default 5s timeout.
  }, 10_000)

  it('publishes an unpublished template', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TemplateAdmin />)
    await screen.findByRole('heading', { name: 'Draft workflow' })

    await user.click(screen.getByRole('button', { name: 'Publish Draft workflow' }))
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/templates/template-1/published',
        expect.objectContaining({ body: { published: true } })
      )
    )
  })

  it('creates a revision for a template', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TemplateAdmin />)
    await screen.findByRole('heading', { name: 'Draft workflow' })

    await user.click(
      screen.getByRole('button', { name: 'Add revision to Draft workflow' })
    )
    await user.click(screen.getByRole('button', { name: 'Create revision' }))
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/templates/template-1/revisions',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })

  it('deletes a template after confirmation', async () => {
    const user = userEvent.setup({ delay: null })
    render(<TemplateAdmin />)
    await screen.findByRole('heading', { name: 'Draft workflow' })

    await user.click(screen.getByRole('button', { name: 'Delete Draft workflow' }))
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/templates/template-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    )
  })
})
