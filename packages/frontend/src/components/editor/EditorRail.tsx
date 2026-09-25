import CloseIcon from '@mui/icons-material/Close'
import { Box, IconButton, Paper } from '@mui/material'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'

const DEFAULT_WIDTH = 400
const MIN_WIDTH = 280
const MAX_WIDTH = 720
const MIN_EDITOR_WIDTH = 320
const KEYBOARD_STEP = 20

const maximumWidth = () =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - MIN_EDITOR_WIDTH))

const clampWidth = (width: number) => Math.min(maximumWidth(), Math.max(MIN_WIDTH, width))

export const EditorRail = ({
  mobile,
  open,
  onClose,
  children
}: {
  mobile: boolean
  open: boolean
  onClose: () => void
  children: ReactNode
}) => {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const fitToViewport = () => setWidth((current) => clampWidth(current))
    window.addEventListener('resize', fitToViewport)
    return () => window.removeEventListener('resize', fitToViewport)
  }, [])

  const stopResizing = () => {
    drag.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | undefined
    if (event.key === 'ArrowLeft') nextWidth = width + KEYBOARD_STEP
    if (event.key === 'ArrowRight') nextWidth = width - KEYBOARD_STEP
    if (event.key === 'Home') nextWidth = MIN_WIDTH
    if (event.key === 'End') nextWidth = maximumWidth()
    if (nextWidth === undefined) return
    event.preventDefault()
    setWidth(clampWidth(nextWidth))
  }

  if (!open) return null
  return (
    <Paper
      square
      elevation={mobile ? 8 : 0}
      aria-label="Editor details"
      sx={
        mobile
          ? {
              position: 'fixed',
              inset: '48px 0 0',
              zIndex: 1200,
              width: '100%',
              overflow: 'auto'
            }
          : {
              position: 'relative',
              width,
              minWidth: width,
              height: '100%',
              overflow: 'auto',
              borderLeft: 1,
              borderColor: 'divider'
            }
      }
    >
      {!mobile && (
        <Box
          role="separator"
          aria-label="Resize editor details"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={maximumWidth()}
          aria-valuenow={width}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => {
            drag.current = { startX: event.clientX, startWidth: width }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!drag.current) return
            setWidth(
              clampWidth(drag.current.startWidth + drag.current.startX - event.clientX)
            )
          }}
          onPointerUp={stopResizing}
          onPointerCancel={stopResizing}
          onLostPointerCapture={stopResizing}
          sx={{
            position: 'absolute',
            inset: '0 auto 0 0',
            zIndex: 1,
            width: 8,
            cursor: 'col-resize',
            touchAction: 'none',
            '&:hover, &:focus-visible': {
              bgcolor: 'primary.main'
            }
          }}
        />
      )}
      {mobile && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
          <IconButton aria-label="Close details" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      )}
      {children}
    </Paper>
  )
}
