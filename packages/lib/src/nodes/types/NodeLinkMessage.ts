// import { INodeOutputSlot } from 'litegraph.js'
export type PromptMessageType = {
  role: string
  content: string
}

export type InOut =
  | 'string'
  | 'number'
  | 'boolean'
  | 'message'
  | '[number]'
  | '[string]'
  | 'image' // Base64 encoded image string: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
  | '*'
