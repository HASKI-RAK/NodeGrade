import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Grid,
  Typography
} from '@mui/material'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '@/api/http'
import { useWorkspaceSession } from '@/hooks/useWorkspaceSession'

type Template = Awaited<ReturnType<typeof api.templates>>[number]

export const TemplatesPage = () => {
  const { session } = useWorkspaceSession()
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const navigate = useNavigate()
  useEffect(() => {
    void api.templates().then(setTemplates)
  }, [])
  if (!templates)
    return (
      <Box p={4}>
        <CircularProgress />
      </Box>
    )
  return (
    <Box p={4}>
      <Button component={Link} to="/">
        Back
      </Button>
      <Typography variant="h4" mb={2}>
        Templates
      </Typography>
      <Grid container spacing={2}>
        {templates.map((template) => (
          <Grid key={template.id} size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">{template.name}</Typography>
                <Typography>{template.description}</Typography>
              </CardContent>
              <CardActions>
                <Button
                  disabled={!session}
                  onClick={async () => {
                    if (!session) return
                    const workflow = await api.fromTemplate(session.token, template.slug)
                    navigate(`/editor/${workflow.id}`)
                  }}
                >
                  Use template
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
