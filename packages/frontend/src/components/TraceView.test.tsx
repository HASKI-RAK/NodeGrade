import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TraceView } from './TraceView'

describe('TraceView', () => {
  it('shows ignored model parameter warnings with provider context', () => {
    render(
      <TraceView
        runState="completed"
        trace={[
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-16T00:00:00.000Z',
            nodeId: 4,
            nodeTitle: 'LLM',
            nodeType: 'models/llm',
            state: 'completed',
            warnings: [
              {
                code: 'UNSUPPORTED_MODEL_PARAMETER',
                parameter: 'top_k',
                providerKey: 'openai',
                modelId: 'model-a'
              }
            ]
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={vi.fn()}
      />
    )

    expect(screen.getByText('top_k was ignored for model-a on openai.')).toBeVisible()
  })
})
