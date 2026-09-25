import type { ClientEventPayload, SerializedGraph } from '@haski/ta-lib'
import type { LGraph } from 'litegraph.js'
import { useCallback, useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'

import { attachDebugSocket, detachDebugSocket } from '@/utils/debugBridge'
import { connectSocket, disconnectSocket, emitEvent, getSocket } from '@/utils/socket'

type RunParams = Omit<
  ClientEventPayload['runGraph'],
  'graph' | 'workflowId' | 'requestId'
>

export function useSocket({
  workflowId,
  workspaceToken,
  lgraph
}: {
  workflowId: string
  workspaceToken?: string | null
  lgraph: LGraph
}) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('Connecting…')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    disconnectSocket()
    const instance = getSocket(workspaceToken)
    attachDebugSocket(instance)
    setSocket(instance)
    const connectedHandler = () => {
      setConnectionStatus('Connected')
      setConnected(true)
    }
    const disconnected = () => {
      setConnectionStatus('Disconnected')
      setConnected(false)
    }
    const failed = () => {
      setConnectionStatus('Connection error')
      setConnected(false)
    }
    instance.on('connect', connectedHandler)
    instance.on('disconnect', disconnected)
    instance.on('connect_error', failed)
    void connectSocket().catch(failed)
    return () => {
      detachDebugSocket(instance)
      disconnectSocket()
    }
  }, [workspaceToken])

  const runGraph = useCallback(
    (params: RunParams) => {
      if (!socket?.connected) throw new Error('Connection to the server is unavailable.')
      const requestId = crypto.randomUUID()
      emitEvent<ClientEventPayload['runGraph']>('runGraph', {
        ...params,
        requestId,
        workflowId,
        graph: JSON.stringify(lgraph.serialize<SerializedGraph>())
      })
      return requestId
    },
    [lgraph, socket, workflowId]
  )

  const cancelRun = useCallback(
    (runId: string) => {
      if (!socket?.connected) return
      emitEvent<ClientEventPayload['cancelRun']>('cancelRun', { runId, workflowId })
    },
    [socket, workflowId]
  )

  return { socket, connectionStatus, connected, runGraph, cancelRun }
}
