import { compactNodeWidgets } from '@haski/ta-lib'
import type { LGraph, LGraphCanvas } from 'litegraph.js'
import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { GraphHistory, isFormControl } from '@/utils/graphHistory'

export const useGraphHistory = (graph: LGraph, canvas: LGraphCanvas | null) => {
  const history = useMemo(
    () =>
      new GraphHistory(
        graph,
        () => (canvas ? Object.keys(canvas.selected_nodes).map(Number) : []),
        (ids) => {
          if (!canvas) return
          canvas.deselectAllNodes()
          canvas.selectNodes(
            ids.map((id) => graph.getNodeById(id)).filter((node) => node !== undefined)
          )
        },
        () =>
          graph.serialize().nodes.forEach(({ id }) => {
            const node = graph.getNodeById(id)
            if (node) compactNodeWidgets(node)
          })
      ),
    [canvas, graph]
  )
  const state = useSyncExternalStore(
    history.subscribe,
    history.getState,
    history.getState
  )

  useEffect(() => {
    const originalBefore = graph.beforeChange.bind(graph)
    const originalAfter = graph.afterChange.bind(graph)
    graph.beforeChange = (info) => {
      history.begin()
      originalBefore(info)
    }
    graph.afterChange = (info) => {
      originalAfter(info)
      history.end()
    }
    return () => {
      graph.beforeChange = originalBefore
      graph.afterChange = originalAfter
    }
  }, [graph, history])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (
        isFormControl(event.target) ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'z'
      )
        return
      event.preventDefault()
      if (event.shiftKey) history.redo()
      else history.undo()
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [history])

  return { history, ...state }
}
