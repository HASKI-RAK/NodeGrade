import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('supports create, revise, publish and delete lifecycle actions', async () => {
    const user = userEvent.setup()
    render(<TemplateAdmin />)
    await screen.findByRole('heading', { name: 'Draft workflow' })

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'New workflow')
    await user.type(screen.getByRole('textbox', { name: 'Slug' }), 'new-workflow')
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

    await user.click(screen.getByRole('button', { name: 'Publish Draft workflow' }))
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/templates/template-1/published',
        expect.objectContaining({ body: { published: true } })
      )
    )

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

    await user.click(screen.getByRole('button', { name: 'Delete Draft workflow' }))
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/admin/templates/template-1',
        expect.objectContaining({ method: 'DELETE' })
      )
    )
  })
})
