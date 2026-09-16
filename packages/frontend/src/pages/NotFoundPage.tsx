import { Box, Button, Typography } from '@mui/material'
import { Link } from 'react-router-dom'

export const NotFoundPage = () => (
  <Box p={4}>
    <Typography variant="h4">Page not found</Typography>
    <Button component={Link} to="/">
      Back to start
    </Button>
  </Box>
)
