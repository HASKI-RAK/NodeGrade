import type { LGraph } from 'litegraph.js'
import { useCallback, useEffect, useRef, useState } from 'react'

import { api, ApiError } from '@/api/http'

export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'

export function useAutosave({
  graph,
  workflowId,
  token,
  initialVersion,
  enabled
}: {
  graph: LGraph
  workflowId: string
  token: string | null
  initialVersion: number
  enabled: boolean
}) {
  const [status, setStatus] = useState<SaveStatus>(enabled ? 'saved' : 'loading')
  const version = useRef(initialVersion)
  const baseline = useRef('')
  const dirtySince = useRef<number | null>(null)
  const lastChange = useRef(0)
  const observed = useRef('')
  const saving = useRef(false)

  const acceptCurrent = useCallback(
    (nextVersion = version.current) => {
      version.current = nextVersion
      baseline.current = JSON.stringify(graph.serialize())
      observed.current = baseline.current
      dirtySince.current = null
      setStatus('saved')
    },
    [graph]
  )

  useEffect(() => {
    if (enabled) acceptCurrent(initialVersion)
  }, [acceptCurrent, enabled, initialVersion])

  const saveNow = useCallback(async (): Promise<SaveStatus> => {
    if (!enabled || saving.current) return status
    const content = JSON.stringify(graph.serialize())
    if (content === baseline.current) return 'saved'
    saving.current = true
    setStatus('saving')
    try {
      const saved = await api.saveWorkflow(token, workflowId, version.current, content)
      version.current = saved.version
      baseline.current = content
      dirtySince.current = null
      setStatus('saved')
      return 'saved'
    } catch (error) {
      const next =
        error instanceof ApiError && error.status === 409 ? 'conflict' : 'error'
      setStatus(next)
      return next
    } finally {
      saving.current = false
    }
  }, [enabled, graph, status, token, workflowId])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      const current = JSON.stringify(graph.serialize())
      const now = Date.now()
      if (current !== baseline.current) {
        if (dirtySince.current === null) dirtySince.current = now
        if (current !== observed.current) {
          observed.current = current
          lastChange.current = now
        }
        if (status === 'saved') {
          setStatus('dirty')
        }
        const idleFor = now - lastChange.current
        const dirtyFor = now - dirtySince.current
        if (
          (status === 'saved' || status === 'dirty') &&
          (idleFor >= 1500 || dirtyFor >= 10_000)
        )
          void saveNow()
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [enabled, graph, saveNow, status])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (['dirty', 'saving', 'error', 'conflict'].includes(status))
        event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  const replaceWithLatest = useCallback(
    (content: string, nextVersion: number) => {
      graph.configure(JSON.parse(content || '{}'))
      graph.setDirtyCanvas(true, true)
      acceptCurrent(nextVersion)
    },
    [acceptCurrent, graph]
  )

  return { status, saveNow, acceptCurrent, replaceWithLatest }
}
