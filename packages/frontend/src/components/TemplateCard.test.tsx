import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TemplateCard, TemplateStructure } from './TemplateCard'

describe('TemplateCard', () => {
  it('highlights workflow methods and shows method tags', () => {
    render(
      <TemplateCard
        name="Workshop 1 · Day and night"
        description="Methods: (1) Expected-words check; (2) Embedding similarity to a reference with cosine similarity; (3) Criterion-based conceptual assessment. Rubric-based scoring with deterministic point aggregation. Classifies answers, drafts feedback, and adds a review stage."
        tags={['keyword', 'similarity']}
        actions={null}
      />
    )

    expect(screen.getByText('Workshop 1 · Day and night')).toBeVisible()
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
    expect(screen.getByText('keyword')).toBeVisible()
    expect(screen.getByText('similarity')).toBeVisible()
  })

  it('lists the nodes of a template graph', () => {
    render(
      <TemplateStructure
        content={JSON.stringify({
          nodes: [{ id: 8, type: 'models/llm', title: 'Assessment model' }],
          links: [[1, 8, 0, 9, 0, 'string']]
        })}
      />
    )

    const structure = screen.getByLabelText('Template structure')
    expect(structure).toHaveTextContent('1 nodes · 1 connections')
    expect(structure).toHaveTextContent('Assessment model')
    expect(structure).toHaveTextContent('models/llm · node 8')
  })
})
