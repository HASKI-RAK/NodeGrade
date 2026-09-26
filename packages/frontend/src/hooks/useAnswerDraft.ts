import { useCallback, useState } from 'react'

const storageKey = (workflowId: string) => `nodegrade.answerDraft.${workflowId}`

const readDraft = (workflowId: string): string => {
  try {
    return window.sessionStorage.getItem(storageKey(workflowId)) ?? ''
  } catch {
    return ''
  }
}

const writeDraft = (workflowId: string, value: string): void => {
  try {
    if (value) window.sessionStorage.setItem(storageKey(workflowId), value)
    else window.sessionStorage.removeItem(storageKey(workflowId))
  } catch {
    // Storage blocked or full: the draft still lives in memory for this editor.
  }
}

/**
 * The Test-tab answer for one workflow, owned by the editor rather than the preview.
 *
 * The preview unmounts whenever the rail switches to the inspector or closes, so an
 * answer held there vanished on the next canvas click. Only the participant clears it:
 * the draft survives rail switches, runs and a trip to the workshop overview (per tab).
 */
export const useAnswerDraft = (workflowId: string): [string, (value: string) => void] => {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const answer = drafts[workflowId] ?? readDraft(workflowId)
  const setAnswer = useCallback(
    (value: string) => {
      writeDraft(workflowId, value)
      setDrafts((current) => ({ ...current, [workflowId]: value }))
    },
    [workflowId]
  )
  return [answer, setAnswer]
}
