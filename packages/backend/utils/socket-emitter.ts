import { Socket } from 'socket.io';
import { ServerEventPayload } from '@haski/ta-lib';

/**
 * Type-safe wrapper for client.emit that ensures correct event names and payload types
 * based on the ServerEvent type definitions.
 *
 * @param client The socket client to emit events to
 * @param eventName The name of the event to emit
 * @param payload The payload for the event
 */
export function emitEvent<K extends keyof ServerEventPayload>(
  client: Socket,
  eventName: K,
  payload: ServerEventPayload[K],
): void {
  client.emit(eventName, payload);
}
