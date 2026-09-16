import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import { FormEvent, useEffect, useState } from 'react'

import { apiRequest } from '@/api/http'

type Session = { enabled: boolean; authenticated: boolean }
type Workshop = {
  id: string
  title: string
  code: string
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
}
type Template = { id: string; name: string }
type Revision = { id: string; name: string; revision: number }

const csrf = () =>
  document.cookie
    .split('; ')
    .find((part) => part.startsWith('ng_admin_csrf='))
    ?.split('=')
    .slice(1)
    .join('=')

const adminPost = <T,>(path: string, body: unknown = {}) =>
  apiRequest<T>(path, {
    method: 'POST',
    headers: { 'X-CSRF-Token': decodeURIComponent(csrf() ?? '') },
    body
  })

export const AdminPage = () => {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    void apiRequest<Session>('/admin/auth/session').then(({ data }) => setSession(data))
  }, [])
  if (!session)
    return (
      <Box p={4}>
        <CircularProgress />
      </Box>
    )
  if (!session.authenticated)
    return (
      <Login
        onLogin={() => setSession({ enabled: true, authenticated: true })}
        enabled={session.enabled}
      />
    )
  return <WorkshopAdmin />
}

const Login = ({ onLogin, enabled }: { onLogin: () => void; enabled: boolean }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await apiRequest('/admin/auth/login', {
        method: 'POST',
        body: { username, password }
      })
      onLogin()
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.')
    }
  }
  return (
    <Box maxWidth={420} mx="auto" p={4}>
      <Typography variant="h4">Facilitator login</Typography>
      {!enabled && (
        <Typography color="error">
          Facilitator access is disabled on this deployment.
        </Typography>
      )}
      <Stack component="form" spacing={2} mt={2} onSubmit={(event) => void submit(event)}>
        <TextField
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" variant="contained" disabled={!enabled}>
          Sign in
        </Button>
        {error && <Typography color="error">{error}</Typography>}
      </Stack>
    </Box>
  )
}

const WorkshopAdmin = () => {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [title, setTitle] = useState('WAIE workshop')
  const [templateId, setTemplateId] = useState('')
  const [revisionId, setRevisionId] = useState('')
  const refresh = () =>
    apiRequest<{ workshops: Workshop[] }>('/admin/workshops').then(({ data }) =>
      setWorkshops(data.workshops)
    )
  useEffect(() => {
    void refresh()
    void apiRequest<{ templates: Template[] }>('/admin/templates').then(({ data }) => {
      setTemplates(data.templates)
      if (data.templates[0]) setTemplateId(data.templates[0].id)
    })
  }, [])
  useEffect(() => {
    if (!templateId) return
    void apiRequest<{ revisions: Revision[] }>(`/admin/templates/${templateId}`).then(
      ({ data }) => {
        setRevisions(data.revisions)
        if (data.revisions[0]) setRevisionId(data.revisions[0].id)
      }
    )
  }, [templateId])
  const create = async () => {
    await adminPost('/admin/workshops', { title, templateRevisionId: revisionId })
    await refresh()
  }
  return (
    <Box maxWidth={900} mx="auto" p={4}>
      <Typography variant="h4">Workshop administration</Typography>
      <Card sx={{ my: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextField
              select
              label="Template"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {templates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Revision"
              value={revisionId}
              onChange={(event) => setRevisionId(event.target.value)}
            >
              {revisions.map((revision) => (
                <MenuItem key={revision.id} value={revision.id}>
                  {revision.name} (r{revision.revision})
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              disabled={!revisionId}
              onClick={() => void create()}
            >
              Create workshop
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Stack spacing={2}>
        {workshops.map((workshop) => (
          <Card key={workshop.id}>
            <CardContent>
              <Typography variant="h6">{workshop.title}</Typography>
              <Typography>
                {workshop.code} · {workshop.status}
              </Typography>
              <Stack direction="row" spacing={1} mt={1}>
                {workshop.status === 'DRAFT' && (
                  <Button
                    onClick={async () => {
                      await adminPost(`/admin/workshops/${workshop.id}/publish`)
                      await refresh()
                    }}
                  >
                    Publish
                  </Button>
                )}
                {workshop.status === 'PUBLISHED' && (
                  <Button
                    color="warning"
                    onClick={async () => {
                      await adminPost(`/admin/workshops/${workshop.id}/close`)
                      await refresh()
                    }}
                  >
                    Close
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
