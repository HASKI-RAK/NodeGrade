import { WebSocket } from 'ws'
import { ServerEvent, ServerEventPayload } from '../../events'

/**
 * Represents a WebSocket node that can optionally handle emitting server events.
 *
 * @template T - The type of the server event name, constrained to the keys of `ServerEventPayload`.
 *
 * @property emitEventCallback - An optional callback function that is invoked to emit a server event.
 * It receives a `ServerEvent` object containing the event name and associated payload.
 */
export interface WebSocketNode {
  emitEventCallback?(event: ServerEvent<keyof ServerEventPayload>): void
}
export default WebSocketNode
