import {
  type ChipMapControl,
  formatKeyMap,
  getNodeDefinition,
  isModelRef,
  MODEL_PARAMETERS,
  type ModelCatalogEntry,
  type ModelRef,
  type NodePropertyDefinition,
  parseKeyMap,
  toneKey
} from '@haski/ta-lib'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
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

/** A "?" that opens a short explanation; paragraphs in `text` are blank-line separated. */
const HelpButton = ({ title, text }: { title: string; text: string }) => {
  const [open, setOpen] = useState(false)
  const label = `Help: ${title}`
  return (
    <>
      <Tooltip title={label}>
        <IconButton size="small" aria-label={label} onClick={() => setOpen(true)}>
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {text.split(/\n\s*\n/).map((paragraph, index) => (
            <Typography key={index} variant="body2" sx={{ mb: 1.5 }}>
              {paragraph}
            </Typography>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/**
 * Edits a `KEY=value, …` property as chips: one group per allowed value, the keys
 * mapped to it as deletable chips, and a field that adds a key on Enter. The text
 * form the node stores is what `parseKeyMap`/`formatKeyMap` read and write, so a
 * hand-typed map and a chip-edited one are the same thing.
 */
const ChipMapEditor = ({
  label,
  control,
  value,
  onChange
}: {
  label: string
  control: ChipMapControl
  value: string
  onChange: (next: string) => void
}) => {
  const allowed = control.groups.map((group) => group.value)
  const map = parseKeyMap(value, allowed)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const add = (group: string) => {
    const key = toneKey(drafts[group] ?? '')
    if (!key) return
    onChange(formatKeyMap({ ...map, [key]: group }))
    setDrafts((current) => ({ ...current, [group]: '' }))
  }
  const remove = (key: string) => {
    const next = { ...map }
    delete next[key]
    onChange(formatKeyMap(next))
  }
  return (
    <Stack spacing={1.5} role="group" aria-label={label}>
      <Typography variant="subtitle2">{label}</Typography>
      {control.groups.map((group) => {
        const keys = Object.entries(map)
          .filter(([, mapped]) => mapped === group.value)
          .map(([key]) => key)
        return (
          <Box key={group.value}>
            <Typography variant="body2">{group.label}</Typography>
            {group.hint && (
              <Typography variant="caption" color="text.secondary" component="p">
                {group.hint}
              </Typography>
            )}
            <Stack
              direction="row"
              spacing={0.5}
              useFlexGap
              alignItems="center"
              sx={{ flexWrap: 'wrap', mt: 0.5 }}
            >
              {keys.map((key) => (
                <Chip
                  key={key}
                  label={key}
                  size="small"
                  onDelete={() => remove(key)}
                  deleteIcon={<span aria-hidden>×</span>}
                  aria-label={`${key} in ${group.label}`}
                />
              ))}
              <TextField
                size="small"
                placeholder={control.placeholder ?? 'Add'}
                value={drafts[group.value] ?? ''}
                slotProps={{ htmlInput: { 'aria-label': `Add to ${group.label}` } }}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [group.value]: event.target.value
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  add(group.value)
                }}
                sx={{ width: 180 }}
              />
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}

const PropertyControl = ({
  node,
  property,
  history,
  modelCatalog,
  defaultModel
}: {
  node: LGraphNode
  property: NodePropertyDefinition
  history: GraphHistory
  modelCatalog: ModelCatalogEntry[]
  defaultModel?: ModelRef | null
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
    const needsSelection = node.properties.needs_model_selection === true
    // Nodes without an explicit model run against the facilitator's deployment
    // default, so they only demand a selection when no usable default exists.
    const defaultEntry =
      !currentRef && defaultModel
        ? modelCatalog.find(
            (entry) =>
              entry.ref.providerKey === defaultModel.providerKey &&
              entry.ref.modelId === defaultModel.modelId
          )
        : undefined
    const showDefault = needsSelection && !currentRef && defaultEntry !== undefined
    return (
      <TextField
        {...common}
        select
        fullWidth
        size="small"
        label={property.label}
        value={selected}
        error={unavailable || (needsSelection && !showDefault)}
        helperText={
          unavailable
            ? 'Saved model is unavailable. Select another model.'
            : showDefault
              ? `Using default model: ${defaultEntry.label} · ${defaultEntry.providerName}. Select another model to override it for this node.`
              : needsSelection
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
  if (control.type === 'chipMap')
    return (
      <ChipMapEditor
        label={property.label}
        control={control}
        value={String(value)}
        onChange={(next) => history.transact(() => commit(next))}
      />
    )
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
      rows={control.type === 'textarea' ? (control.rows ?? 8) : undefined}
      type={control.type === 'number' ? 'number' : 'text'}
      sx={
        control.type === 'textarea'
          ? { '& textarea': { resize: 'vertical', overflowY: 'auto', minHeight: 160 } }
          : undefined
      }
      onChange={(event) =>
        commit(
          control.type === 'number' ? Number(event.target.value) : event.target.value
        )
      }
    />
  )
}

/** A property control with its "?" beside it when the definition carries help text. */
const PropertyEditor = (props: {
  node: LGraphNode
  property: NodePropertyDefinition
  history: GraphHistory
  modelCatalog: ModelCatalogEntry[]
  defaultModel?: ModelRef | null
}) => {
  const { property } = props
  if (!property.help) return <PropertyControl {...props} />
  return (
    <Stack direction="row" spacing={0.5} alignItems="flex-start">
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <PropertyControl {...props} />
      </Box>
      <HelpButton title={property.label} text={property.help} />
    </Stack>
  )
}

export const NodeInspector = ({
  selection,
  history,
  modelCatalog = [],
  defaultModel = null,
  onOpenBlock
}: {
  selection: LGraphNode[]
  history: GraphHistory
  modelCatalog?: ModelCatalogEntry[]
  defaultModel?: ModelRef | null
  onOpenBlock?: (node: LGraphNode) => void
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
  if (
    node.type === 'graph/subgraph' &&
    typeof node.properties.templateBlock === 'object' &&
    node.properties.templateBlock !== null
  ) {
    const provenance = node.properties.templateBlock as {
      templateName?: unknown
      templateRevision?: unknown
    }
    const boundary = Array.isArray(node.properties.templateBoundary)
      ? (node.properties.templateBoundary as Array<{
          key: string
          label: string
          direction: 'input' | 'output'
          description?: string
          required?: boolean
        }>)
      : []
    return (
      <Stack spacing={2} p={3} sx={{ overflowY: 'auto' }}>
        <Box>
          <Typography variant="h6">
            {String(provenance.templateName ?? node.title)}
          </Typography>
          {!!node.properties.templateDescription && (
            <Typography color="text.secondary" variant="body2">
              {String(node.properties.templateDescription)}
            </Typography>
          )}
        </Box>
        <Typography variant="body2">
          Source template revision {String(provenance.templateRevision ?? '')}
        </Typography>
        <Box>
          <Typography variant="subtitle2">Boundary ports</Typography>
          {boundary.map((port) => (
            <Box key={port.key} mt={1}>
              <Typography variant="body2">
                {port.label} · {port.direction}
                {port.required ? ' · required' : ''}
              </Typography>
              {port.description && (
                <Typography color="text.secondary" variant="caption">
                  {port.description}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
        <Button variant="contained" onClick={() => onOpenBlock?.(node)}>
          Open block
        </Button>
      </Stack>
    )
  }
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
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="h6" sx={{ flexGrow: 1, minWidth: 0 }}>
            {definition.title}
          </Typography>
          {definition.help && (
            <HelpButton title={definition.title} text={definition.help} />
          )}
        </Stack>
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
            defaultModel={defaultModel}
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
                  defaultModel={defaultModel}
                />
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  )
}
