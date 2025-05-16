/* eslint-disable immutable/no-mutation */
import { LGraph } from 'litegraph.js'
import { useCallback } from 'react'

interface UseGraphOperationsOptions {
  lgraph: LGraph
}

export interface UseGraphOperationsResult {
  handleDownloadGraph: () => void
  handleUploadGraph: () => void
}

export function useGraphOperations({
  lgraph
}: UseGraphOperationsOptions): UseGraphOperationsResult {
  const handleDownloadGraph = useCallback(() => {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(lgraph.serialize())
    )}`
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.setAttribute('href', dataStr)
    downloadAnchorNode.setAttribute('download', 'graph.json')
    document.body.appendChild(downloadAnchorNode) // required for firefox
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }, [lgraph])

  const handleUploadGraph = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const contents = e.target?.result
          if (typeof contents === 'string') {
            console.log('File contents:', contents)
            lgraph.configure(JSON.parse(contents))
            lgraph.setDirtyCanvas(true, true)
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }, [lgraph])

  return {
    handleDownloadGraph,
    handleUploadGraph
  }
}
