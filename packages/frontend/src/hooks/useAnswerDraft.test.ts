import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useAnswerDraft } from './useAnswerDraft'

describe('useAnswerDraft', () => {
  afterEach(() => window.sessionStorage.clear())

  it('keeps one draft per workflow', () => {
    const { result, rerender } = renderHook(({ id }) => useAnswerDraft(id), {
      initialProps: { id: 'workflow-a' }
    })

    act(() => result.current[1]('Answer for A'))
    rerender({ id: 'workflow-b' })
    expect(result.current[0]).toBe('')

    act(() => result.current[1]('Answer for B'))
    rerender({ id: 'workflow-a' })
    expect(result.current[0]).toBe('Answer for A')
  })

  it('restores the draft after the editor unmounts', () => {
    const first = renderHook(() => useAnswerDraft('workflow-a'))
    act(() => first.result.current[1]('Survives the overview'))
    first.unmount()

    const second = renderHook(() => useAnswerDraft('workflow-a'))
    expect(second.result.current[0]).toBe('Survives the overview')
  })

  it('forgets a draft the participant cleared', () => {
    const first = renderHook(() => useAnswerDraft('workflow-a'))
    act(() => first.result.current[1]('Something'))
    act(() => first.result.current[1](''))
    first.unmount()

    expect(renderHook(() => useAnswerDraft('workflow-a')).result.current[0]).toBe('')
  })
})
