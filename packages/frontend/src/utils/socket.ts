import { ClientEventPayload, ServerEvent, ServerEventPayload } from '@haski/ta-lib'
import { io, Socket } from 'socket.io-client'

import { getConfig } from './config'

// Create a socket instance that will be reused across the application
// Initially not connected - will connect when needed by components
let socket: Socket | null = null

/**
 * Initialize and get the Socket.IO client instance
 * @param path - The URL path to connect to, appended to the base WS URL from config
 * @returns The Socket.IO client instance
 */
export const getSocket = (path: string): Socket => {
  if (!socket) {
    const URL = getConfig().WS

    // Remove the leading '/' if present in both URL and path
    const formattedUrl =
      URL?.endsWith('/') && path.startsWith('/') ? URL + path.substring(1) : URL + path

    socket = io(formattedUrl, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })
  }

  return socket
}

/**
 * Disconnect the socket if it exists and is connected
 */
export const disconnectSocket = (): void => {
  if (socket && socket.connected) {
    socket.disconnect()
  }
}

/**
 * Connect to the socket server
 */
export const connectSocket = (): void => {
  if (socket && !socket.connected) {
    socket.connect()
  }
}

/**
 * Send a WebSocket event to the server
 * @param eventName - The name of the event
 * @param payload - The payload to send
 */
export const emitEvent = <K extends keyof ClientEventPayload>(
  eventName: K,
  payload: ClientEventPayload[K]
): void => {
  if (!socket) {
    console.error('Socket not initialized')
    return
  }

  socket.emit(eventName, {
    eventName,
    payload
  })
}

/**
 * Creates a type-safe event handler map for server events
 */
export type ServerEventHandlerMap = {
  [K in keyof ServerEventPayload]?: (payload: ServerEventPayload[K]) => void
}

/**
 * Register handlers for multiple WebSocket events
 * @param handlers - Map of event names to handler functions
 * @returns Function to remove all event listeners
 */
export const handleEvents = (handlers: ServerEventHandlerMap): (() => void) => {
  if (!socket) {
    console.error('Socket not initialized')
    return () => {}
  }

  // Create an array of cleanup functions
  const cleanupFunctions: Array<() => void> = []

  // Register each handler with proper type casting
  ;(
    Object.entries(handlers) as Array<
      [keyof ServerEventPayload, ((payload: any) => void) | undefined]
    >
  ).forEach(([eventName, handler]) => {
    if (handler) {
      const cleanup = handleEvent(eventName, (event) => {
        handler(event.payload)
      })
      cleanupFunctions.push(cleanup)
    }
  })

  // Return a function to clean up all listeners
  return () => {
    cleanupFunctions.forEach((cleanup) => cleanup())
  }
}

/**
 * Handle incoming WebSocket events
 * @param event - The event to handle
 * @param onEvent - The callback function to execute when the event is received
 * @returns Function to remove the event listener
 */
export const handleEvent = <K extends keyof ServerEventPayload>(
  event: K,
  onEvent: (event: ServerEvent<K>) => void
): (() => void) => {
  if (!socket) {
    console.error('Socket not initialized')
    return () => {}
  }

  // Create handler function that can be referenced for removal
  const handler = (...args: any[]) => {
    // Extract the payload from the first argument
    const payload = args[0] as ServerEventPayload[K]
    const wsEvent: ServerEvent<K> = {
      eventName: event,
      payload
    }
    onEvent(wsEvent)
  }

  // Add the event listener using the event name directly
  socket.on(event as string, handler)

  // Return a function to remove the event listener
  return () => {
    if (socket) {
      socket.off(event as string, handler)
    }
  }
}

/**
 * Reset the socket instance, forcing a new connection on next getSocket call
 */
export const resetSocket = (): void => {
  if (socket) {
    if (socket.connected) {
      socket.disconnect()
    }
    socket = null
  }
}
