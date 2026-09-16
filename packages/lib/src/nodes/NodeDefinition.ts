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

export type NodePropertyControl =
  | TextControl
  | TextareaControl
  | NumberControl
  | SliderControl
  | ToggleControl
  | SelectControl
  | FileControl

export interface NodePropertyDefinition {
  key: string
  label: string
  control: NodePropertyControl
  advanced: boolean
  required: boolean
  validation?: PropertyValidation
  keyValue?: boolean
}

export interface NodeDefinition {
  type: string
  title: string
  category: NodeCategory
  description: string
  tags?: readonly string[]
  properties: readonly NodePropertyDefinition[]
}
