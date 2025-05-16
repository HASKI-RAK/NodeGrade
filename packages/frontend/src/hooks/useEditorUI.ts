import { useCallback, useEffect, useState } from 'react'

interface UseEditorUIOptions {
  initialDrawerState?: boolean
}

export interface UseEditorUIResult {
  open: boolean
  handleDrawerOpen: () => void
  handleDrawerClose: () => void
  size: {
    width: number
    height: number
  }
  checkSize: () => void
  selectedGraph: string
  setSelectedGraph: (graph: string) => void
}

export function useEditorUI({
  initialDrawerState = true
}: UseEditorUIOptions = {}): UseEditorUIResult {
  const [open, setOpen] = useState(initialDrawerState)
  const [selectedGraph, setSelectedGraph] = useState<string>(window.location.pathname)

  const [size, setSize] = useState({
    width: window.outerWidth,
    height: window.outerHeight
  })

  const handleDrawerOpen = useCallback(() => {
    setOpen(true)
  }, [])

  const handleDrawerClose = useCallback(() => {
    setOpen(false)
  }, [])

  const checkSize = useCallback(() => {
    setSize({
      width: window.outerWidth,
      height: window.outerWidth
    })
  }, [])

  // Add resize event listener
  useEffect(() => {
    window.addEventListener('resize', checkSize)
    return () => {
      window.removeEventListener('resize', checkSize)
    }
  }, [checkSize])

  return {
    open,
    handleDrawerOpen,
    handleDrawerClose,
    size,
    checkSize,
    selectedGraph,
    setSelectedGraph
  }
}
