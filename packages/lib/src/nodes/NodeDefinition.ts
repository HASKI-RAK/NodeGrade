export type NodeCategory = 'Essential' | 'AI' | 'Assessment' | 'Validation'

export type PropertyValidation = {
  min?: number
  max?: number
  pattern?: string
  message?: string
}

type BaseControl = { placeholder?: string }
export type TextControl = BaseControl & { type: 'text' }
export type TextareaControl = BaseControl & { type: 'textarea'; rows?: number }
export type NumberControl = BaseControl & {
  type: 'number'
  min?: number
  max?: number
  step?: number
}
export type SliderControl = { type: 'slider'; min: number; max: number; step: number }
export type ToggleControl = { type: 'toggle' }
export type SelectControl = {
  type: 'select'
  options: readonly string[]
  optionsProperty?: string
}
export type FileControl = { type: 'file'; accept?: string }
export type ModelControl = { type: 'model' }
/**
 * A `KEY=value, KEY=value` string edited as chips: one group per allowed value,
 * each holding the keys mapped to it, with a field to add a key.
 */
export type ChipMapControl = {
  type: 'chipMap'
  groups: readonly { value: string; label: string; hint?: string }[]
  placeholder?: string
}

export type NodePropertyControl =
  | TextControl
  | TextareaControl
  | NumberControl
  | SliderControl
  | ToggleControl
  | SelectControl
  | FileControl
  | ModelControl
  | ChipMapControl

export interface NodePropertyDefinition {
  key: string
  label: string
  control: NodePropertyControl
  advanced: boolean
  required: boolean
  validation?: PropertyValidation
  keyValue?: boolean
  /** Shown behind a "?" next to the control; paragraphs separated by blank lines. */
  help?: string
}

export interface NodeDefinition {
  type: string
  title: string
  category: NodeCategory
  description: string
  tags?: readonly string[]
  properties: readonly NodePropertyDefinition[]
  /** Shown behind a "?" next to the node title; paragraphs separated by blank lines. */
  help?: string
}
