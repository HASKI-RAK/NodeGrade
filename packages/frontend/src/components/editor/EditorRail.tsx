import CloseIcon from '@mui/icons-material/Close'
import { Box, IconButton, Paper } from '@mui/material'
import type { ReactNode } from 'react'

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
              width: 400,
              minWidth: 400,
              height: '100%',
              overflow: 'auto',
              borderLeft: 1,
              borderColor: 'divider'
            }
      }
    >
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
