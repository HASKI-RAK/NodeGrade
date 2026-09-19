import type { NodeCategory } from '@haski/ta-lib'

export const CATEGORY_ORDER: readonly NodeCategory[] = [
  'Essential',
  'AI',
  'Assessment',
  'Validation'
]

export const CATEGORY_DESCRIPTIONS: Record<NodeCategory, string> = {
  Essential: 'Reusable building blocks: text, numbers, routing and utilities.',
  AI: 'Language-model prompts, embeddings and generated text.',
  Assessment: 'Learner-facing question, answer and feedback.',
  Validation: 'Checks, normalization and scoring before feedback.'
}
