import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

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
type Provider = {
  id: string
  key: string
  type: 'MODEL_WORKER' | 'OPENAI' | 'OPENROUTER' | 'OPENAI_COMPATIBLE'
  displayName: string
  baseUrl: string | null
  enabled: boolean
  hasApiKey: boolean
  apiKeyHint: string | null
}

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
const adminPut = <T,>(path: string, body: unknown) =>
  apiRequest<T>(path, {
    method: 'PUT',
    headers: { 'X-CSRF-Token': decodeURIComponent(csrf() ?? '') },
    body
  })

export const AdminPage = () => {
  const location = useLocation()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  useEffect(() => {
    void apiRequest<Session>('/admin/auth/session')
      .then(({ data }) => setSession(data))
      .catch((error: unknown) =>
        setSessionError(error instanceof Error ? error.message : 'Session check failed.')
      )
  }, [])
  if (sessionError)
    return (
      <Box p={4}>
        <Typography color="error">{sessionError}</Typography>
      </Box>
    )
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
  return (
    <Box maxWidth={1000} mx="auto" p={4}>
      <Typography variant="h4">Administration</Typography>
      <Stack direction="row" spacing={1} my={2}>
        <Button
          component={Link}
          to="/admin/workshops"
          variant={location.pathname.endsWith('workshops') ? 'contained' : 'outlined'}
        >
          Workshops
        </Button>
        <Button
          component={Link}
          to="/admin/providers"
          variant={location.pathname.endsWith('providers') ? 'contained' : 'outlined'}
        >
          Providers
        </Button>
      </Stack>
      {location.pathname.endsWith('providers') ? <ProviderAdmin /> : <WorkshopAdmin />}
    </Box>
  )
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

const ProviderAdmin = () => {
  const [providers, setProviders] = useState<Provider[]>([])
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const refresh = async () => {
    const { data } = await apiRequest<{ providers: Provider[] }>('/admin/providers')
    setProviders(data.providers)
  }
  useEffect(() => {
    void refresh().catch((refreshError: unknown) =>
      setError(
        refreshError instanceof Error ? refreshError.message : 'Provider loading failed.'
      )
    )
  }, [])
  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      await adminPost('/admin/providers', {
        displayName,
        baseUrl,
        enabled: false,
        credential: apiKey ? { mode: 'REPLACE', value: apiKey } : { mode: 'KEEP' }
      })
      setDisplayName('')
      setBaseUrl('')
      setApiKey('')
      setMessage('Provider created.')
      await refresh()
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Provider creation failed.'
      )
    } finally {
      setCreating(false)
    }
  }
  return (
    <Stack spacing={2}>
      <Typography variant="h5">LLM providers</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Add OpenAI-compatible provider</Typography>
            <TextField
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <TextField
              label="Base URL"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <TextField
              label="API key (optional)"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <Button
              variant="contained"
              disabled={creating || !displayName.trim() || !baseUrl.trim()}
              onClick={() => void create()}
            >
              Add provider
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          onSaved={async (nextMessage) => {
            setMessage(nextMessage)
            await refresh()
          }}
        />
      ))}
      {message && <Typography color="success.main">{message}</Typography>}
      {error && <Typography color="error">{error}</Typography>}
    </Stack>
  )
}

const ProviderCard = ({
  provider,
  onSaved
}: {
  provider: Provider
  onSaved: (message: string) => Promise<void>
}) => {
  const [name, setName] = useState(provider.displayName)
  const [url, setUrl] = useState(provider.baseUrl ?? '')
  const [enabled, setEnabled] = useState(provider.enabled)
  const [replacement, setReplacement] = useState('')
  const [removeCredential, setRemoveCredential] = useState(false)
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setName(provider.displayName)
    setUrl(provider.baseUrl ?? '')
    setEnabled(provider.enabled)
    setReplacement('')
    setRemoveCredential(false)
  }, [provider])
  const save = async () => {
    const credential = removeCredential
      ? { mode: 'REMOVE' }
      : replacement.trim()
        ? { mode: 'REPLACE', value: replacement }
        : { mode: 'KEEP' }
    setBusy(true)
    setError(null)
    try {
      await adminPut(`/admin/providers/${provider.id}`, {
        displayName: name,
        baseUrl: url,
        enabled,
        credential
      })
      setReplacement('')
      setRemoveCredential(false)
      await onSaved(`${name} saved.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Provider save failed.')
    } finally {
      setBusy(false)
    }
  }
  const test = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await adminPost<{ status: string }>(
        `/admin/providers/${provider.id}/test`
      )
      setTestStatus(data.status)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Connection test failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6">{provider.displayName}</Typography>
            <Chip size="small" label={provider.type} />
            <Chip size="small" label={provider.key} variant="outlined" />
          </Stack>
          <TextField
            label="Display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="Base URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <FormControlLabel
            control={
              <Switch checked={enabled} onChange={(_, checked) => setEnabled(checked)} />
            }
            label="Enabled"
          />
          <TextField
            label={
              provider.hasApiKey ? `Replace API key (${provider.apiKeyHint})` : 'API key'
            }
            type="password"
            value={replacement}
            disabled={removeCredential}
            onChange={(event) => setReplacement(event.target.value)}
          />
          {provider.hasApiKey && (
            <FormControlLabel
              control={
                <Switch
                  checked={removeCredential}
                  onChange={(_, checked) => setRemoveCredential(checked)}
                />
              }
              label="Remove stored API key"
            />
          )}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            <Button disabled={busy} onClick={() => void test()}>
              Test saved connection
            </Button>
            {testStatus && <Chip label={testStatus} />}
          </Stack>
          {error && <Typography color="error">{error}</Typography>}
        </Stack>
      </CardContent>
    </Card>
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
    <Box>
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
