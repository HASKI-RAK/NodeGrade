/** Stable external port declared by a reusable block template. */
export type BlockBoundaryPort = {
  key: string
  label: string
  dataType: string
  direction: 'input' | 'output'
  internalNodeId: number
  internalSlot: number
  required?: boolean
  description?: string
}

/** Legacy expanded-block port retained while existing clients migrate. */
export type BlockPort = {
  nodeId: number
  slot: number
  name: string
  type: string
}

/** Ordered boundary used to construct a Subgraph wrapper. */
export type BlockInterfaces = {
  boundary: BlockBoundaryPort[]
  inputs?: BlockPort[]
  outputs?: BlockPort[]
}

/** Copied onto an inserted wrapper so later template revisions stay independent. */
export type TemplateBlockProvenance = {
  templateId: string
  templateRevision: number
  templateName: string
  insertedAt: string
}

const isBoundaryPort = (value: unknown): value is BlockBoundaryPort => {
  if (typeof value !== 'object' || value === null) return false
  const port = value as Record<string, unknown>
  return (
    typeof port.key === 'string' &&
    port.key.length > 0 &&
    typeof port.label === 'string' &&
    typeof port.dataType === 'string' &&
    (port.direction === 'input' || port.direction === 'output') &&
    typeof port.internalNodeId === 'number' &&
    Number.isInteger(port.internalNodeId) &&
    typeof port.internalSlot === 'number' &&
    Number.isInteger(port.internalSlot) &&
    port.internalSlot >= 0 &&
    (port.required === undefined || typeof port.required === 'boolean') &&
    (port.description === undefined || typeof port.description === 'string')
  )
}

export const isBlockInterfaces = (value: unknown): value is BlockInterfaces => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.boundary) && candidate.boundary.every(isBoundaryPort)
}
