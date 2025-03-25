import { AnswerInputNode, LGraph, OutputNode, sendWs } from '@haski/ta-lib'
import { IncomingMessage } from 'http'
import { WebSocket } from 'ws'

import { runGraph, saveGraph } from '../src/WebsocketOperations'
import { runLgraph, sendQuestion } from '../src/Graph'
import { prismaGraphCreateOrUpdate } from '../src/utils/prismaOperations'
import { log, xAPI } from '../src/server'
import prisma from '../src/client'

// Mock dependencies
jest.mock('@haski/ta-lib', () => ({
  AnswerInputNode: jest.fn(),
  OutputNode: jest.fn(),
  sendWs: jest.fn(),
  // Mock constructor for LGraph
  LGraph: jest.fn().mockImplementation(() => ({
    configure: jest.fn(),
    findNodesByClass: jest.fn(),
    serialize: jest.fn().mockReturnValue({ serialized: 'graph' })
  }))
}))

jest.mock('../src/Graph', () => ({
  runLgraph: jest.fn().mockResolvedValue(undefined),
  sendQuestion: jest.fn()
}))

jest.mock('../src/utils/prismaOperations', () => ({
  prismaGraphCreateOrUpdate: jest
    .fn()
    .mockResolvedValue({ id: '1', path: '/test', graph: '{}' })
}))

jest.mock('../src/server', () => ({
  log: {
    debug: jest.fn(),
    trace: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  },
  xAPI: {
    sendStatement: jest.fn()
  }
}))

jest.mock('../src/client', () => ({}))

describe('WebsocketOperations', () => {
  let mockWs: WebSocket
  let mockLgraph: any
  let mockRequest: IncomingMessage

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock WebSocket
    mockWs = {
      send: jest.fn(),
      readyState: WebSocket.OPEN
    } as unknown as WebSocket

    // Setup mock LGraph
    mockLgraph = new LGraph()

    // Setup mock request
    mockRequest = {
      url: '/test/path'
    } as IncomingMessage

    // Setup findNodesByClass mock implementation
    mockLgraph.findNodesByClass = jest.fn().mockImplementation((nodeClass) => {
      if (nodeClass === AnswerInputNode) {
        return [
          {
            properties: { value: '' },
            setValue: function (value: string) {
              this.properties.value = value
            }
          }
        ] as unknown as AnswerInputNode[]
      }
      if (nodeClass === OutputNode) {
        return [
          {
            properties: { value: 'output', type: 'text', label: 'test', uniqueId: '1' }
          }
        ] as unknown as OutputNode[]
      }
      return []
    }) as unknown as typeof mockLgraph.findNodesByClass

    // Mock Date.now
    jest.spyOn(Date, 'now').mockReturnValue(1000)
    Date.now = jest.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2000)
  })

  describe('runGraph', () => {
    const mockPayload = {
      graph: {
        nodes: [],
        links: [],
        last_node_id: 0,
        last_link_id: 0,
        groups: [],
        config: {},
        version: 1
      },
      answer: 'test answer',
      user_id: 'user1',
      timestamp: '2023-01-01',
      domain: 'test-domain'
    }

    beforeEach(() => {
      // Reset the mock implementation for each test
      mockLgraph.findNodesByClass.mockImplementation((nodeClass) => {
        if (nodeClass === AnswerInputNode) {
          return [
            {
              properties: { value: '' },
              setValue: function (value: string) {
                this.properties.value = value
              }
            }
          ]
        }
        if (nodeClass === OutputNode) {
          return [
            {
              properties: { value: 'output', type: 'text', label: 'test', uniqueId: '1' }
            }
          ]
        }
        return []
      })
    })

    it('should configure the graph and set answer input node values', () => {
      runGraph(mockPayload, mockWs, mockLgraph)

      expect(mockLgraph.configure).toHaveBeenCalledWith(mockPayload.graph)
      expect(mockLgraph.findNodesByClass).toHaveBeenCalledWith(AnswerInputNode)
    })

    it('should call runLgraph with the configured graph', () => {
      runGraph(mockPayload, mockWs, mockLgraph)

      expect(runLgraph).toHaveBeenCalledWith(mockLgraph, expect.any(Function))
    })

    it('should send progress updates via WebSocket', async () => {
      // Extract the callback function from runLgraph call
      let progressCallback: (progress: number) => void

        // Override the runLgraph mock to capture the callback
      ;(runLgraph as jest.Mock).mockImplementation((graph, callback) => {
        progressCallback = callback
        return Promise.resolve()
      })

      runGraph(mockPayload, mockWs, mockLgraph)

      // Simulate progress updates
      progressCallback!(0.5)

      expect(sendWs).toHaveBeenCalledWith(mockWs, {
        eventName: 'processingPercentageUpdate',
        payload: 50
      })
    })

    it('should send graph finished event when graph execution completes', async () => {
      await runGraph(mockPayload, mockWs, mockLgraph)

      // Wait for promises to resolve
      await new Promise(process.nextTick)

      expect(sendWs).toHaveBeenCalledWith(mockWs, {
        eventName: 'graphFinished',
        payload: { serialized: 'graph' }
      })
    })

    it('should log xAPI statement with output nodes data', async () => {
      await runGraph(mockPayload, mockWs, mockLgraph)

      // Wait for promises to resolve
      await new Promise(process.nextTick)

      expect(xAPI.sendStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          statement: expect.objectContaining({
            object: expect.objectContaining({
              definition: expect.objectContaining({
                extensions: expect.objectContaining({
                  'https://ta.haski.app/variables/services.outputs': [
                    { value: 'output', type: 'text', label: 'test', uniqueId: '1' }
                  ]
                })
              })
            })
          })
        })
      )
    })

    it('should handle xAPI errors gracefully', async () => {
      ;(xAPI.sendStatement as jest.Mock).mockImplementationOnce(() => {
        throw new Error('xAPI error')
      })

      await runGraph(mockPayload, mockWs, mockLgraph)

      // Wait for promises to resolve
      await new Promise(process.nextTick)

      expect(log.error).toHaveBeenCalledWith(
        'Error sending xAPI statement: ',
        expect.any(Error)
      )

      // Should still send the graph finished event
      expect(sendWs).toHaveBeenCalledWith(mockWs, {
        eventName: 'graphFinished',
        payload: expect.anything()
      })
    })

    it('should log execution time', async () => {
      await runGraph(mockPayload, mockWs, mockLgraph)

      // Wait for promises to resolve
      await new Promise(process.nextTick)

      expect(log.info).toHaveBeenCalledWith('Time it took to run graph: ', 1000)
    })
  })

  describe('saveGraph', () => {
    const mockPayload = {
      graph: {
        nodes: [],
        links: [],
        last_node_id: 0,
        last_link_id: 0,
        groups: [],
        config: {},
        version: 1
      },
      name: 'test-graph'
    }

    const payloadWithoutName = {
      graph: {
        nodes: [],
        links: [],
        last_node_id: 0,
        last_link_id: 0,
        groups: [],
        config: {},
        version: 1
      }
    }

    it('should configure the graph with the provided payload', async () => {
      await saveGraph(mockPayload, mockLgraph, mockRequest, mockWs)

      expect(mockLgraph.configure).toHaveBeenCalledWith(mockPayload.graph)
    })

    it('should use the provided name when saving the graph', async () => {
      await saveGraph(mockPayload, mockLgraph, mockRequest, mockWs)

      expect(prismaGraphCreateOrUpdate).toHaveBeenCalledWith(
        prisma,
        'test-graph',
        mockLgraph
      )
    })

    it('should use request URL path when name is not provided', async () => {
      await saveGraph(payloadWithoutName, mockLgraph, mockRequest, mockWs)

      expect(prismaGraphCreateOrUpdate).toHaveBeenCalledWith(
        prisma,
        '/test/path',
        mockLgraph
      )
    })

    it('should send graphSaved event via WebSocket', async () => {
      await saveGraph(mockPayload, mockLgraph, mockRequest, mockWs)

      expect(sendWs).toHaveBeenCalledWith(mockWs, {
        eventName: 'graphSaved',
        payload: { serialized: 'graph' }
      })
    })

    it('should call sendQuestion after saving the graph', async () => {
      await saveGraph(mockPayload, mockLgraph, mockRequest, mockWs)

      expect(sendQuestion).toHaveBeenCalledWith(mockLgraph, mockWs)
    })

    it('should log debug information', async () => {
      await saveGraph(mockPayload, mockLgraph, mockRequest, mockWs)

      expect(log.debug).toHaveBeenCalledWith('event: saveGraph')
      expect(log.trace).toHaveBeenCalledWith('Saving graph with name: ', 'test-graph')
    })
  })
})
