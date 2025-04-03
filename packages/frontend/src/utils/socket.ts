import { io, Socket } from 'socket.io-client'

import { getConfig } from './config'

// Store the socket instance
let socket: Socket | null = null

/**
 * Get the socket instance for the specified path or return the existing one
 * @param path - The path to connect to (optional)
 * @returns The socket instance
 */
export const getSocket = (path?: string): Socket => {
  if (!socket) {
    const url = getConfig().BACKEND_URL || 'http://localhost:5000'
    const fullUrl = path ? `${url}/${path}` : url
    console.log('Connecting to socket at:', fullUrl)
    socket = io(url)

    // Add global error handler
    socket.on('error', (error) => {
      console.error('Socket error:', error)
    })

    // Add debug logging
    socket.on('connect', () => {
      console.log(`Socket connected to ${fullUrl}`)
    })

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${reason}`)
    })
  }

  return socket
}

/**
 * Connect to the socket server
 * @returns Promise that resolves when connected
 */
export const connectSocket = (): Promise<void> => {
  if (!socket) {
    throw new Error('Socket not initialized. Call getSocket() first.')
  }

  // If already connected, return resolved promise
  if (socket.connected) {
    return Promise.resolve()
  }

  // Connect and return promise that resolves on connection
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      socket?.off('connect_error', onError)
      resolve()
    }

    const onError = (error: Error) => {
      socket?.off('connect', onConnect)
      reject(error)
    }

    socket?.once('connect', onConnect)
    socket?.once('connect_error', onError)

    // Try to connect
    socket?.connect()
  })
}

/**
 * Disconnect from the socket server
 */
export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect()
    socket.removeAllListeners()
    socket = null
  }
}

/**
 * Emit an event to the socket server
 * @param event - The event name
 * @param payload - The payload to send
 */
export const emitEvent = <T>(event: string, payload: T): void => {
  if (!socket) {
    console.error('Socket not initialized. Call getSocket() first.')
    return
  }

  if (!socket.connected) {
    console.warn('Socket not connected. Attempting to connect...')
    connectSocket()
      .then(() => socket?.emit(event, payload))
      .catch((error) => console.error('Failed to connect socket:', error))
    return
  }

  socket.emit(event, payload)
}

// Export socket for direct access if needed
export { socket }
