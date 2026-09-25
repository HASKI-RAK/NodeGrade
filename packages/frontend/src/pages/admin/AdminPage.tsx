import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { apiRequest } from '@/api/http'

import { adminPost, adminPut } from './adminApi'
import { TemplateAdmin } from './TemplateAdmin'
import { WorkshopAdmin } from './WorkshopAdmin'

type Session = { enabled: boolean; authenticated: boolean }
type PolicyMode = 'DENY_ALL' | 'ALLOWLIST' | 'ALLOW_ALL'
type Provider = {
  id: string
  key: string
  type: 'MODEL_WORKER' | 'OPENAI' | 'OPENROUTER' | 'OPENAI_COMPATIBLE'
  displayName: string
  baseUrl: string | null
  enabled: boolean
  hasApiKey: boolean
  apiKeyHint: string | null
  policy: { mode: PolicyMode | null; allowedModels: string[] }
}
type ProviderCatalog = {
  status: string
  models: { modelId: string; label: string; allowed: boolean }[]
}
type ExecutionLimits = {
  workspaceConcurrentRuns: number
  providerConcurrentRequests: number
}
type DeploymentSettings = {
  defaultModel: { providerKey: string; modelId: string } | null
}

const policyModes: { value: PolicyMode; label: string }[] = [
  { value: 'DENY_ALL', label: 'Deny all — no models offered' },
  { value: 'ALLOWLIST', label: 'Allowlist — only the models I pick' },
  { value: 'ALLOW_ALL', label: 'Allow all — every catalog model' }
]

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
    <Box
      component="main"
      boxSizing="border-box"
      minHeight="100dvh"
      maxWidth={1000}
      mx="auto"
      p={4}
    >
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
        <Button
          component={Link}
          to="/admin/templates"
          variant={location.pathname.endsWith('templates') ? 'contained' : 'outlined'}
        >
          Templates
        </Button>
      </Stack>
      {location.pathname.endsWith('providers') ? (
        <ProviderAdmin />
      ) : location.pathname.endsWith('templates') ? (
        <TemplateAdmin />
      ) : (
        <WorkshopAdmin />
      )}
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
      <DefaultModelCard onSaved={setMessage} />
      <ExecutionLimitsCard onSaved={setMessage} />
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
  const [mode, setMode] = useState<PolicyMode | ''>(provider.policy.mode ?? '')
  const [allowed, setAllowed] = useState<string[]>(provider.policy.allowedModels)
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null)
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setName(provider.displayName)
    setUrl(provider.baseUrl ?? '')
    setEnabled(provider.enabled)
    setReplacement('')
    setRemoveCredential(false)
    setMode(provider.policy.mode ?? '')
    setAllowed(provider.policy.allowedModels)
  }, [provider])
  // The allowlist is curated against what the provider really offers right now, so the
  // catalog is fetched the moment that mode is chosen.
  useEffect(() => {
    if (mode !== 'ALLOWLIST' || catalog) return
    void apiRequest<ProviderCatalog>(`/admin/providers/${provider.id}/models`)
      .then(({ data }) => setCatalog(data))
      .catch(() => setCatalog({ status: 'UNREACHABLE', models: [] }))
  }, [mode, catalog, provider.id])
  const toggleModel = (modelId: string, checked: boolean) =>
    setAllowed((current) =>
      checked ? [...current, modelId] : current.filter((id) => id !== modelId)
    )
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
        credential,
        ...(mode ? { policy: { mode, allowedModels: allowed } } : {})
      })
      setReplacement('')
      setRemoveCredential(false)
      setCatalog(null)
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
          <Divider />
          <TextField
            select
            label="Model policy"
            value={mode}
            helperText="Participants can only select and run models this policy permits."
            onChange={(event) => setMode(event.target.value as PolicyMode)}
          >
            <MenuItem value="" disabled>
              Choose a policy
            </MenuItem>
            {policyModes.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          {mode === 'ALLOWLIST' &&
            (catalog === null ? (
              <CircularProgress size={20} />
            ) : catalog.status === 'AVAILABLE' ? (
              <FormGroup sx={{ maxHeight: 260, overflowY: 'auto' }}>
                {catalog.models.map((model) => (
                  <FormControlLabel
                    key={model.modelId}
                    control={
                      <Checkbox
                        checked={allowed.includes(model.modelId)}
                        onChange={(_, checked) => toggleModel(model.modelId, checked)}
                      />
                    }
                    label={model.label}
                  />
                ))}
              </FormGroup>
            ) : (
              <Typography color="warning.main">
                The provider catalog is unavailable ({catalog.status}). The saved
                allowlist stays in force; {allowed.length} model(s) are allowed.
              </Typography>
            ))}
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

/**
 * The facilitator's deployment default model (SPEC-0016). Every workflow model node
 * without an explicit selection runs against this model, so templates and ad-hoc
 * graphs no longer need a per-node choice. The picker only offers enabled providers
 * and models their policy permits — the same set execution would accept.
 */
const DefaultModelCard = ({ onSaved }: { onSaved: (message: string) => void }) => {
  const [settings, setSettings] = useState<DeploymentSettings | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerKey, setProviderKey] = useState('')
  const [modelId, setModelId] = useState('')
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void (async () => {
      try {
        const [{ data: stored }, { data: listed }] = await Promise.all([
          apiRequest<DeploymentSettings>('/admin/deployment-settings'),
          apiRequest<{ providers: Provider[] }>('/admin/providers')
        ])
        setSettings(stored)
        setProviders(listed.providers)
        const fallback =
          stored.defaultModel?.providerKey ??
          listed.providers.find((provider) => provider.enabled)?.key ??
          ''
        setProviderKey(fallback)
        setModelId(stored.defaultModel?.modelId ?? '')
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error ? loadError.message : 'Default model load failed.'
        )
      }
    })()
  }, [])
  const providerId = providers.find((provider) => provider.key === providerKey)?.id
  useEffect(() => {
    setCatalog(null)
    if (!providerId) return
    void apiRequest<ProviderCatalog>(`/admin/providers/${providerId}/models`)
      .then(({ data }) => {
        setCatalog(data)
        setModelId((current) =>
          data.models.some((model) => model.modelId === current && model.allowed)
            ? current
            : ''
        )
      })
      .catch(() => setCatalog({ status: 'UNREACHABLE', models: [] }))
  }, [providerId])
  const candidates = (catalog?.models ?? []).filter((model) => model.allowed)
  const currentLabel = settings?.defaultModel
    ? (providers.find((provider) => provider.key === settings.defaultModel?.providerKey)
        ?.displayName ?? settings.defaultModel.providerKey) +
      ` / ${settings.defaultModel.modelId}`
    : null
  const save = async () => {
    if (!providerKey || !modelId) return
    setBusy(true)
    setError(null)
    try {
      const { data } = await adminPut<DeploymentSettings>('/admin/deployment-settings', {
        providerKey,
        modelId
      })
      setSettings(data)
      onSaved('Default model saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Default save failed.')
    } finally {
      setBusy(false)
    }
  }
  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await adminPut<DeploymentSettings>('/admin/deployment-settings', {
        providerKey: null,
        modelId: null
      })
      setSettings(data)
      setModelId('')
      onSaved('Default model cleared.')
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Default clear failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Default model</Typography>
          <Typography variant="body2" color="text.secondary">
            Used by every workflow model node without an explicit selection. Stored graphs
            stay untouched — clearing the default restores the per-node choice.
          </Typography>
          <Typography variant="body2">
            Current default:{' '}
            {currentLabel ?? 'none — every model node needs its own selection'}
          </Typography>
          <TextField
            select
            label="Provider"
            value={providerKey}
            onChange={(event) => {
              setProviderKey(event.target.value)
              setModelId('')
            }}
          >
            {providers
              .filter((provider) => provider.enabled)
              .map((provider) => (
                <MenuItem key={provider.key} value={provider.key}>
                  {provider.displayName}
                </MenuItem>
              ))}
          </TextField>
          {catalog === null ? (
            <CircularProgress size={20} />
          ) : catalog.status === 'AVAILABLE' ? (
            <TextField
              select
              label="Model"
              value={modelId}
              helperText={
                candidates.length === 0
                  ? 'This provider permits no model for participants.'
                  : undefined
              }
              onChange={(event) => setModelId(event.target.value)}
            >
              {candidates.map((model) => (
                <MenuItem key={model.modelId} value={model.modelId}>
                  {model.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Typography color="warning.main">
              The provider catalog is unavailable ({catalog.status}). Saving is disabled
              until it answers.
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={busy || !providerKey || !modelId}
              onClick={() => void save()}
            >
              Save default
            </Button>
            <Button
              disabled={busy || !settings?.defaultModel}
              onClick={() => void clear()}
            >
              Clear
            </Button>
          </Stack>
          {error && <Typography color="error">{error}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  )
}

const ExecutionLimitsCard = ({ onSaved }: { onSaved: (message: string) => void }) => {
  const [limits, setLimits] = useState<ExecutionLimits | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void apiRequest<{ limits: ExecutionLimits }>('/admin/execution-limits')
      .then(({ data }) => setLimits(data.limits))
      .catch((limitsError: unknown) =>
        setError(
          limitsError instanceof Error ? limitsError.message : 'Limit load failed.'
        )
      )
  }, [])
  const save = async () => {
    if (!limits) return
    setBusy(true)
    setError(null)
    try {
      await adminPut('/admin/execution-limits', limits)
      onSaved('Concurrency limits saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Limit save failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Concurrency guards</Typography>
          <Typography variant="body2" color="text.secondary">
            Caps protecting a shared provider key from saturation. They apply to new runs
            immediately.
          </Typography>
          {limits && (
            <>
              <TextField
                label="Concurrent runs per workspace"
                type="number"
                value={limits.workspaceConcurrentRuns}
                onChange={(event) =>
                  setLimits({
                    ...limits,
                    workspaceConcurrentRuns: Number(event.target.value)
                  })
                }
              />
              <TextField
                label="Concurrent provider requests (deployment-wide)"
                type="number"
                value={limits.providerConcurrentRequests}
                onChange={(event) =>
                  setLimits({
                    ...limits,
                    providerConcurrentRequests: Number(event.target.value)
                  })
                }
              />
              <Button variant="contained" disabled={busy} onClick={() => void save()}>
                Save limits
              </Button>
            </>
          )}
          {error && <Typography color="error">{error}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  )
}
