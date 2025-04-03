import { WebSocket } from 'ws'
import {
  ServerEventPayload,
  ServerEvent,
  ClientEventPayload,
  WebSocketEvent
} from '../events'
/**
 * Send a message to the client on an established WebSocket connection
 * @param ws - WebSocket used to send the message
 * @param event - Event to send
 */
export const sendWs = <K extends keyof ServerEventPayload>(
  ws: WebSocket,
  event: ServerEvent<K>
): void => {
  ws.send(JSON.stringify(event))
}

// Define a mapping of event names to handler functions
export type EventHandlerMap<S extends ServerEventPayload | ClientEventPayload> = {
  [K in keyof S]: (payload: S[K]) => void | Promise<void>
}

/**
 * Handles a WebSocket server request.
 * The type determines the event name and payload type.
 * @param WsEvent - Event to handle
 * @param handlers - Mapping of event names to handler functions
 * @returns Whether the event was handled
 * @example
 * ```ts
 * // Type determines the handler functions
 * handleWsRequest<ServerEventPayload>(lgraph_json, {
          graphFinished: (payload) => {},
          nodeExecuting: (nodeId) => {},
          nodeExecuted: (nodeId) => {},
          graphSaved: () => {},
          feedback: (feedback) => {}
        })
 * ```
 */
export const handleWsRequest = async <S extends ServerEventPayload | ClientEventPayload>(
  WsEvent: WebSocketEvent<S>,
  handlers: EventHandlerMap<S>
): Promise<boolean> => {
  // Utility function to safely handle events
  async function handleEvent<K extends keyof S>(
    eventName: K,
    payload: S[keyof S]
  ): Promise<boolean> {
    const handler = handlers[eventName]
    if (handler) {
      await handler(payload as S[K])
      return true
    } else return false
  }
  return await handleEvent<keyof S>(WsEvent.eventName, WsEvent.payload)
}
