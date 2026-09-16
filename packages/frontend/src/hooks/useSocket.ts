import type { ClientEventPayload, SerializedGraph } from '@haski/ta-lib'
import type { LGraph } from 'litegraph.js'
import { useCallback, useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'

import { attachDebugSocket, detachDebugSocket } from '@/utils/debugBridge'
import { connectSocket, disconnectSocket, emitEvent, getSocket } from '@/utils/socket'

type RunParams = Omit<ClientEventPayload['runGraph'], 'graph' | 'workflowId'>

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

  useEffect(() => {
    disconnectSocket()
    const instance = getSocket(workspaceToken)
    attachDebugSocket(instance)
    setSocket(instance)
    const connected = () => setConnectionStatus('Connected')
    const disconnected = () => setConnectionStatus('Disconnected')
    const failed = () => setConnectionStatus('Connection error')
    instance.on('connect', connected)
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
      emitEvent<ClientEventPayload['runGraph']>('runGraph', {
        ...params,
        workflowId,
        graph: JSON.stringify(lgraph.serialize<SerializedGraph>())
      })
    },
    [lgraph, socket, workflowId]
  )

  return { socket, connectionStatus, runGraph }
}
