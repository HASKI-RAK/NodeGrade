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
  | '[message]'
  | 'image' // Base64 encoded image string: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
  | '*'

/**
 * A port that accepts more than one link type. LiteGraph reads a comma-joined
 * list (`isValidConnection` splits on `,` and tries every permutation), so the
 * array is only the authoring form; `toSlotType` produces the wire format.
 * The first member is the port's primary type and decides its color and shape.
 */
export type PortType = InOut | readonly InOut[]

/** Comma-joined slot type LiteGraph stores and validates against. */
export const toSlotType = (type: PortType): string =>
  typeof type === 'string' ? type : type.join(',')

/**
 * The type a multi-type port is drawn as: the first declared member, or the
 * first segment of a serialized comma-joined slot type (SPEC-0019/FR-008).
 */
export const primaryLinkType = (type: PortType | string): InOut =>
  (typeof type === 'string' ? type.split(',')[0] : type[0]) as InOut
