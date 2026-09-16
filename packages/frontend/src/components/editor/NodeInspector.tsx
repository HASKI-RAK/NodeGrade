import {
  getNodeDefinition,
  isModelRef,
  MODEL_PARAMETERS,
  type ModelCatalogEntry,
  type NodePropertyDefinition
} from '@haski/ta-lib'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import type { LGraphNode } from 'litegraph.js'
import { useEffect, useState } from 'react'

import type { GraphHistory } from '@/utils/graphHistory'

const shownValue = (
  node: LGraphNode,
  property: NodePropertyDefinition
): string | number | boolean => {
  const value = node.properties[property.key]
  if (
    property.key === 'value' &&
    typeof value === 'object' &&
    value !== null &&
    'content' in value
  ) {
    const content = Reflect.get(value, 'content')
    return typeof content === 'string' ? content : ''
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value
  return ''
}

const validationMessage = (
  property: NodePropertyDefinition,
  value: string | number | boolean
): string | null => {
  if (property.required && String(value).trim() === '')
    return `${property.label} is required.`
  if (
    typeof value === 'number' &&
    property.validation?.min !== undefined &&
    value < property.validation.min
  )
    return property.validation.message ?? `Minimum value is ${property.validation.min}.`
  if (
    typeof value === 'number' &&
    property.validation?.max !== undefined &&
    value > property.validation.max
  )
    return property.validation.message ?? `Maximum value is ${property.validation.max}.`
  if (
    typeof value === 'string' &&
    property.validation?.pattern &&
    !new RegExp(property.validation.pattern).test(value)
  )
    return property.validation.message ?? 'Value is invalid.'
  return null
}

const PropertyEditor = ({
  node,
  property,
  history,
  modelCatalog
}: {
  node: LGraphNode
  property: NodePropertyDefinition
  history: GraphHistory
  modelCatalog: ModelCatalogEntry[]
}) => {
  const [value, setValue] = useState(() => shownValue(node, property))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setValue(shownValue(node, property))
    setError(null)
  }, [node, property])

  const commit = (next: string | number | boolean) => {
    setValue(next)
    const message = validationMessage(property, next)
    setError(message)
    if (message) return
    const current = node.properties[property.key]
    const committed =
      property.key === 'value' &&
      typeof current === 'object' &&
      current !== null &&
      'content' in current
        ? { ...current, content: String(next) }
        : next
    node.setProperty(property.key, committed)
    node.setDirtyCanvas(true, true)
  }
  const common = { onFocus: history.begin, onBlur: history.end }
  const control = property.control
  const currentRef = isModelRef(node.properties.model_ref)
    ? node.properties.model_ref
    : null
  const selectedModel = currentRef
    ? modelCatalog.find(
        (entry) =>
          entry.ref.providerKey === currentRef.providerKey &&
          entry.ref.modelId === currentRef.modelId
      )
    : undefined
  const parameter = MODEL_PARAMETERS.find((candidate) => candidate === property.key)
  const unsupported = Boolean(
    parameter &&
    selectedModel &&
    !selectedModel.capabilities.supportedParameters.includes(parameter)
  )
  if (control.type === 'model') {
    const selected = currentRef ? JSON.stringify(currentRef) : ''
    const unavailable = Boolean(currentRef && !selectedModel)
    return (
      <TextField
        {...common}
        select
        fullWidth
        size="small"
        label={property.label}
        value={selected}
        error={unavailable || node.properties.needs_model_selection === true}
        helperText={
          unavailable
            ? 'Saved model is unavailable. Select another model.'
            : node.properties.needs_model_selection === true
              ? 'Select a provider and model.'
              : undefined
        }
        onChange={(event) => {
          const entry = modelCatalog.find(
            (model) => JSON.stringify(model.ref) === event.target.value
          )
          if (!entry) return
          history.transact(() => {
            node.setProperty('model_ref', entry.ref)
            node.setProperty('model', entry.ref.modelId)
            node.setProperty('needs_model_selection', false)
            node.setDirtyCanvas(true, true)
          })
        }}
      >
        {unavailable && (
          <MenuItem value={selected} disabled>
            {currentRef?.modelId} · unavailable
          </MenuItem>
        )}
        {modelCatalog.map((entry) => (
          <MenuItem value={JSON.stringify(entry.ref)} key={JSON.stringify(entry.ref)}>
            {entry.label} · {entry.providerName}
          </MenuItem>
        ))}
      </TextField>
    )
  }
  if (control.type === 'toggle')
    return (
      <FormControlLabel
        control={
          <Switch
            checked={Boolean(value)}
            onFocus={history.begin}
            onBlur={history.end}
            onChange={(_, checked) => commit(checked)}
          />
        }
        label={property.label}
      />
    )
  if (control.type === 'slider')
    return (
      <Box>
        <Typography gutterBottom>
          {property.label}: {Number(value)}
        </Typography>
        <Slider
          {...common}
          value={Number(value)}
          min={control.min}
          max={control.max}
          step={control.step}
          disabled={unsupported}
          onChange={(_, next) => commit(Array.isArray(next) ? next[0] : next)}
        />
      </Box>
    )
  if (control.type === 'select') {
    const dynamic = control.optionsProperty
      ? node.properties[control.optionsProperty]
      : undefined
    const options = Array.isArray(dynamic)
      ? dynamic.filter((item): item is string => typeof item === 'string')
      : control.options
    return (
      <TextField
        {...common}
        select
        fullWidth
        size="small"
        label={property.label}
        value={String(value)}
        error={!!error}
        helperText={error}
        disabled={unsupported}
        onChange={(event) => commit(event.target.value)}
      >
        {options.map((option) => (
          <MenuItem value={option} key={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    )
  }
  if (control.type === 'file')
    return (
      <Stack spacing={1}>
        <Button component="label" variant="outlined">
          Choose {property.label}
          <input
            hidden
            type="file"
            accept={control.accept}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              history.begin()
              if (file.type.startsWith('image/')) {
                const reader = new FileReader()
                reader.onload = () => {
                  commit(typeof reader.result === 'string' ? reader.result : '')
                  history.end()
                }
                reader.readAsDataURL(file)
              } else
                void file.text().then((content) => {
                  commit(content)
                  node.setProperty('documentName', file.name)
                  history.end()
                })
            }}
          />
        </Button>
        {value && (
          <Button
            size="small"
            onClick={() =>
              history.transact(() => {
                commit('')
                if ('documentName' in node.properties)
                  node.setProperty('documentName', '')
              })
            }
          >
            Clear
          </Button>
        )}
        {error && (
          <Typography color="error" variant="caption">
            {error}
          </Typography>
        )}
      </Stack>
    )
  return (
    <TextField
      {...common}
      fullWidth
      size="small"
      label={property.label}
      value={value}
      error={!!error}
      helperText={error}
      disabled={unsupported}
      multiline={control.type === 'textarea'}
      rows={control.type === 'textarea' ? (control.rows ?? 4) : undefined}
      type={control.type === 'number' ? 'number' : 'text'}
      onChange={(event) =>
        commit(
          control.type === 'number' ? Number(event.target.value) : event.target.value
        )
      }
    />
  )
}

export const NodeInspector = ({
  selection,
  history,
  modelCatalog = []
}: {
  selection: LGraphNode[]
  history: GraphHistory
  modelCatalog?: ModelCatalogEntry[]
}) => {
  if (!selection.length)
    return (
      <Box p={3}>
        <Typography variant="h6">Inspector</Typography>
        <Typography color="text.secondary">
          Select one node to edit its properties.
        </Typography>
      </Box>
    )
  if (selection.length > 1)
    return (
      <Box p={3}>
        <Typography variant="h6">Inspector</Typography>
        <Typography color="text.secondary">
          Multiple nodes selected. Select one node to edit properties.
        </Typography>
      </Box>
    )
  const node = selection[0]
  const definition = node.type ? getNodeDefinition(node.type) : undefined
  if (!definition)
    return (
      <Box p={3}>
        <Typography variant="h6">{node.title}</Typography>
        <Typography color="text.secondary">
          This node has no editable properties.
        </Typography>
      </Box>
    )
  const basic = definition.properties.filter((property) => !property.advanced)
  const advanced = definition.properties.filter((property) => property.advanced)
  return (
    <Stack spacing={2} p={3} sx={{ overflowY: 'auto' }}>
      <Box>
        <Typography variant="h6">{definition.title}</Typography>
        <Typography color="text.secondary" variant="body2">
          {definition.description}
        </Typography>
      </Box>
      {basic.length ? (
        basic.map((property) => (
          <PropertyEditor
            key={property.key}
            node={node}
            property={property}
            history={history}
            modelCatalog={modelCatalog}
          />
        ))
      ) : (
        <Typography color="text.secondary">
          This node has no editable properties.
        </Typography>
      )}
      {!!advanced.length && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced</AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {advanced.map((property) => (
                <PropertyEditor
                  key={property.key}
                  node={node}
                  property={property}
                  history={history}
                  modelCatalog={modelCatalog}
                />
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  )
}
