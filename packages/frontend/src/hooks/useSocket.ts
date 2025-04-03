import { ClientEventPayload, SerializedGraph } from '@haski/ta-lib'
import { LGraph } from 'litegraph.js'
import { useCallback, useEffect, useState } from 'react'
import { Socket } from 'socket.io-client'

import { connectSocket, disconnectSocket, emitEvent, getSocket } from '@/utils/socket'

interface UseSocketOptions {
  socketPath: string
  lgraph: LGraph
}

export interface UseSocketResult {
  socket: Socket | null
  connectionStatus: string
  runGraph: (params: {
    answer: string
    user_id?: string
    timestamp?: string
    domain: string
  }) => void
  loadGraph: (workflowId: string) => void
  saveGraph: (name: string) => void
  publishGraph: (path: string) => void
}

export function useSocket({ socketPath, lgraph }: UseSocketOptions): UseSocketResult {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('Connecting...')

  // Initialize socket and set up event listeners
  useEffect(() => {
    // Disconnect any existing socket before creating a new one
    disconnectSocket()

    const socketInstance = getSocket(socketPath)
    console.log('Socket instance created:', socketInstance)
    setSocket(socketInstance)

    function onConnect() {
      setConnectionStatus('Connected')
      console.log('Socket connected successfully')
    }

    function onDisconnect() {
      setConnectionStatus('Disconnected')
      console.log('Socket disconnected')
    }

    function onConnectError(error: Error) {
      setConnectionStatus('Connection error')
      console.error('Socket connection error:', error)
      // Try to reconnect after a short delay
      setTimeout(() => {
        console.log('Attempting to reconnect...')
        connectSocket()
      }, 2000)
    }

    // Set up connection event listeners
    socketInstance.on('connect', onConnect)
    socketInstance.on('disconnect', onDisconnect)
    socketInstance.on('connect_error', onConnectError)

    // Connect to the socket server
    connectSocket()

    // Cleanup function
    return () => {
      // Remove all event listeners
      socketInstance.off('connect', onConnect)
      socketInstance.off('disconnect', onDisconnect)
      socketInstance.off('connect_error', onConnectError)

      // Disconnect socket on component unmount
      disconnectSocket()
    }
  }, [socketPath])

  const runGraph = useCallback(
    (params: {
      answer: string
      user_id?: string
      timestamp?: string
      domain: string
    }) => {
      if (socket && socket.connected) {
        emitEvent<ClientEventPayload['runGraph']>('runGraph', {
          ...params,
          graph: JSON.stringify(lgraph.serialize<SerializedGraph>())
        })
      } else {
        console.error('Socket not connected')
        throw new Error('Connection to server lost. Please refresh the page.')
      }
    },
    [socket, lgraph]
  )

  const loadGraph = useCallback(
    (workflowId: string) => {
      if (socket && socket.connected) {
        emitEvent('loadGraph', workflowId)
      } else {
        console.error('Socket not connected')
        throw new Error('Connection to server lost. Please refresh the page.')
      }
    },
    [socket]
  )

  const saveGraph = useCallback(
    (name: string) => {
      if (socket && socket.connected) {
        emitEvent('saveGraph', {
          graph: JSON.stringify(lgraph.serialize<SerializedGraph>()),
          name
        })
      } else {
        console.error('Socket not connected')
        throw new Error('Connection to server lost. Please refresh the page.')
      }
    },
    [socket, lgraph]
  )

  const publishGraph = useCallback(
    (path: string) => {
      const name = path.replace('editor', 'student')
      saveGraph(name)
    },
    [saveGraph]
  )

  return {
    socket,
    connectionStatus,
    runGraph,
    loadGraph,
    saveGraph,
    publishGraph
  }
}
