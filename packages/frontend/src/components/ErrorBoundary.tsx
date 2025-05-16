/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable immutable/no-this */
import { Box, Button, Typography } from '@mui/material'
import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            textAlign: 'center',
            padding: 2
          }}
        >
          <Typography variant="h4" gutterBottom>
            Oops! Something went wrong.
          </Typography>
          <Typography variant="body1" gutterBottom>
            It seems the page encountered an unexpected error. Don’t worry, it happens to
            the best of us!
          </Typography>
          <Typography variant="body1" gutterBottom>
            Try refreshing the page to see if that fixes the issue.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => window.location.reload()}
            sx={{ marginTop: 2 }}
          >
            Refresh Page
          </Button>
        </Box>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
