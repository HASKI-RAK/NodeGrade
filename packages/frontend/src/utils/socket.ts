import { io, type Socket } from 'socket.io-client'

import { getConfig } from './config'

let socket: Socket | null = null

export const getSocket = (workspaceToken?: string | null): Socket => {
  if (!socket) {
    const configured = getConfig().API ?? window.location.origin
    const url = new URL(configured, window.location.origin).origin
    socket = io(url, {
      withCredentials: true,
      path: '/socket.io',
      transports: ['websocket'],
      auth: workspaceToken ? { workspaceToken } : {}
    })
  }
  return socket
}

export const connectSocket = (): Promise<void> => {
  if (!socket) throw new Error('Socket is not initialized.')
  if (socket.connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const connected = () => {
      socket?.off('connect_error', failed)
      resolve()
    }
    const failed = (error: Error) => {
      socket?.off('connect', connected)
      reject(error)
    }
    socket?.once('connect', connected)
    socket?.once('connect_error', failed)
    socket?.connect()
  })
}

export const disconnectSocket = (): void => {
  socket?.disconnect()
  socket?.removeAllListeners()
  socket = null
}

export const emitEvent = <T>(event: string, payload: T): void => {
  socket?.emit(event, payload)
}

export { socket }
