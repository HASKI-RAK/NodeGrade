import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api/http'

import { TemplatesPage } from './TemplatesPage'

vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/http')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      templates: vi.fn(),
      template: vi.fn(),
      fromTemplate: vi.fn()
    }
  }
})
vi.mock('@/hooks/useWorkspaceSession', () => ({
  useWorkspaceSession: () => ({ session: null })
}))

const templates = [
  {
    id: 'workflow-1',
    slug: 'waie',
    kind: 'WORKFLOW' as const,
    name: 'WAIE assessment',
    description: 'Complete assessment',
    category: 'Workshop',
    tags: [],
    currentRevision: 1
  },
  {
    id: 'block-1',
    slug: 'feedback',
    kind: 'BLOCK' as const,
    name: 'Feedback generator',
    description: 'Reusable feedback block',
    category: 'Feedback',
    tags: [],
    currentRevision: 1
  }
]

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.mocked(api.templates).mockResolvedValue(templates)
    vi.mocked(api.template).mockResolvedValue({
      template: templates[0],
      revision: {
        id: 'revision-1',
        revision: 1,
        name: 'WAIE assessment',
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
  })

  it('shows category metadata and filters workflow and block templates', async () => {
    render(
      <MemoryRouter>
        <TemplatesPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Workshop')).toBeVisible()
    expect(screen.getByText('Feedback')).toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'Template type' }))
    await userEvent.click(screen.getByRole('option', { name: 'Blocks' }))
    await waitFor(() => expect(screen.queryByText('WAIE assessment')).toBeNull())
    expect(screen.getByText('Feedback generator')).toBeVisible()
  })

  it('opens a structural preview before use', async () => {
    render(
      <MemoryRouter>
        <TemplatesPage />
      </MemoryRouter>
    )

    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Preview structure' }))[0]
    )
    const structure = await screen.findByLabelText('Template structure')
    expect(structure).toHaveTextContent('1 nodes · 1 connections')
    expect(structure).toHaveTextContent('Assessment model')
    expect(structure).toHaveTextContent('models/llm · node 8')
  })

  it('highlights workflow methods and shows method tags on the card', async () => {
    vi.mocked(api.templates).mockResolvedValue([
      {
        id: 'workflow-1',
        slug: 'workshop-words-vs-understanding',
        kind: 'WORKFLOW' as const,
        name: 'Workshop 1 · Day and night',
        description:
          'Methods: (1) Expected-words check; (2) Embedding similarity to a reference with cosine similarity; (3) Criterion-based conceptual assessment. Rubric-based scoring with deterministic point aggregation. Classifies answers, drafts feedback, and adds a review stage.',
        category: 'Workshop',
        tags: ['keyword', 'similarity', 'katalyst'],
        currentRevision: 1
      }
    ])

    render(
      <MemoryRouter>
        <TemplatesPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Workshop 1 · Day and night')).toBeVisible()
    // Method phrases render bold on the card.
    expect(screen.getByText('Expected-words check', { selector: 'strong' })).toBeVisible()
    expect(
      screen.getByText('Embedding similarity to a reference', { selector: 'strong' })
    ).toBeVisible()
    expect(screen.getByText('cosine similarity', { selector: 'strong' })).toBeVisible()
    expect(screen.getByText('Rubric-based scoring', { selector: 'strong' })).toBeVisible()
    expect(
      screen.getByText('deterministic point aggregation', { selector: 'strong' })
    ).toBeVisible()
    expect(screen.getByText('Classifies', { selector: 'strong' })).toBeVisible()
    expect(screen.getByText('drafts feedback', { selector: 'strong' })).toBeVisible()
    expect(screen.getByText('review stage', { selector: 'strong' })).toBeVisible()
    // Tags surface as method chips.
    expect(screen.getByText('keyword')).toBeVisible()
    expect(screen.getByText('similarity')).toBeVisible()
  })
})
