import {
  type AnswerConstraints,
  resolveAnswerConstraints,
  resolveQuestionText,
  type WorkflowNodeSnapshot
} from '@haski/ta-lib'
import type { LGraph } from 'litegraph.js'
import { useEffect, useState } from 'react'

export type WorkflowForm = {
  question: string
  constraints: AnswerConstraints
}

const EMPTY: WorkflowForm = { question: '', constraints: {} }

const readForm = (graph: LGraph): WorkflowForm => {
  const { nodes = [] } = graph.serialize() as { nodes?: WorkflowNodeSnapshot[] }
  return {
    question: resolveQuestionText(nodes) ?? '',
    constraints: resolveAnswerConstraints(nodes)
  }
}

const unchanged = (current: WorkflowForm, next: WorkflowForm): boolean =>
  current.question === next.question &&
  current.constraints.minChars === next.constraints.minChars &&
  current.constraints.maxChars === next.constraints.maxChars

/**
 * The question and answer bounds the open workflow declares (SPEC-0007/FR-002, FR-007).
 *
 * Read from the graph rather than from run events, so editing the question node in the
 * inspector changes the Test tab without a run in between (FR-003/AC-003). LiteGraph
 * mutates node properties in place and offers no change event a React tree can subscribe
 * to — the inspector, the canvas' inline editors and undo all write straight to the graph
 * object — so this polls while the preview is open instead of pretending to observe it.
 */
export const useWorkflowForm = (
  graph: LGraph,
  active: boolean,
  intervalMs = 400
): WorkflowForm => {
  const [form, setForm] = useState<WorkflowForm>(EMPTY)

  useEffect(() => {
    if (!active) return
    const refresh = () =>
      setForm((current) => {
        const next = readForm(graph)
        return unchanged(current, next) ? current : next
      })
    refresh()
    const timer = window.setInterval(refresh, intervalMs)
    return () => window.clearInterval(timer)
  }, [graph, active, intervalMs])

  return form
}
