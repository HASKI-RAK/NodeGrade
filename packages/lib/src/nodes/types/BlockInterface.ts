/**
 * The external ports a block template declares (SPEC-0003/FR-019).
 *
 * A block is a subgraph, so "which of my slots are meant to be wired to the rest of the
 * workflow" is not something that can be inferred: an unconnected input might be an
 * intentional constant. Declaring them is what lets insertion suggest connections
 * (FR-020) instead of dropping a disconnected island on the canvas.
 */
export type BlockPort = {
  /** Node id within the block's own content, before insertion remaps it. */
  nodeId: number
  /** Slot index on that node. */
  slot: number
  /** Shown to the user in the connection suggestion. */
  name: string
  /** LiteGraph data type, used to decide which existing nodes are compatible. */
  type: string
}

export type BlockInterfaces = {
  inputs: BlockPort[]
  outputs: BlockPort[]
}

const isPort = (value: unknown): value is BlockPort => {
  if (typeof value !== 'object' || value === null) return false
  const port = value as Record<string, unknown>
  return (
    typeof port.nodeId === 'number' &&
    Number.isInteger(port.nodeId) &&
    typeof port.slot === 'number' &&
    Number.isInteger(port.slot) &&
    port.slot >= 0 &&
    typeof port.name === 'string' &&
    typeof port.type === 'string'
  )
}

export const isBlockInterfaces = (value: unknown): value is BlockInterfaces => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    Array.isArray(candidate.inputs) &&
    Array.isArray(candidate.outputs) &&
    candidate.inputs.every(isPort) &&
    candidate.outputs.every(isPort)
  )
}
