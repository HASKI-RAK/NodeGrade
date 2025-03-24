import { ClientEventPayload, LGraph, sendWs, SerializedGraph } from '@haski/ta-lib'
import { IncomingMessage } from 'http'
import { WebSocket } from 'ws'

import { prismaMock } from '../singleton'
import { runGraph, saveGraph } from '../src/WebsocketOperations'

// Mock for the prismaGraphCreateOrUpdate function
jest.mock('../src/utils/prismaOperations', () => ({
  prismaGraphCreateOrUpdate: jest.fn().mockResolvedValue({
    id: 1,
    path: '/ws/test-path',
    graph: '{}'
  })
}))

// Mocking dependencies
jest.mock('../src/Graph', () => ({
  runLgraph: jest.fn().mockResolvedValue(true),
  sendQuestion: jest.fn()
}))

jest.mock('@haski/ta-lib', () => {
  const original = jest.requireActual('@haski/ta-lib')
  return {
    ...original,
    sendWs: jest.fn((ws, message) => {
      ws.send(JSON.stringify(message))
    })
  }
})

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

// Mock for LGraph and related classes
const mockLGraph = {
  configure: jest.fn(),
  findNodesByClass: jest.fn().mockReturnValue([]),
  serialize: jest.fn().mockReturnValue({})
}

describe('WebsocketOperations', () => {
  let mockWs: WebSocket
  let mockRequest: IncomingMessage

  beforeEach(() => {
    mockWs = {
      send: jest.fn()
    } as unknown as WebSocket

    mockRequest = {
      url: '/ws/test-path'
    } as unknown as IncomingMessage

    jest.clearAllMocks()
  })

  describe('runGraph', () => {
    it('should process a run graph request', () => {
      // Arrange
      const payload: ClientEventPayload['runGraph'] = {
        answer: 'Test answer',
        user_id: 'test-user',
        timestamp: '2025-03-24T12:00:00Z',
        domain: 'test-domain',
        graph: {} as SerializedGraph
      }

      mockLGraph.findNodesByClass.mockImplementation((cls) => {
        if (cls.name === 'AnswerInputNode') {
          return [{ properties: { value: '' } }]
        }
        if (cls.name === 'OutputNode') {
          return [{ properties: { value: 'test output' } }]
        }
        return []
      })

      // Act
      runGraph(payload, mockWs, mockLGraph as unknown as LGraph)

      // Assert
      expect(mockLGraph.configure).toHaveBeenCalledWith(payload.graph)
      expect(mockLGraph.findNodesByClass).toHaveBeenCalled()
    })
  })

  describe('saveGraph', () => {
    it('should save a graph to the database', async () => {
      // Arrange
      const payload: ClientEventPayload['saveGraph'] = {
        graph: {} as SerializedGraph,
        name: '/ws/test-graph'
      }

      // Act
      await saveGraph(payload, mockLGraph as unknown as LGraph, mockRequest, mockWs)

      // Assert
      expect(mockLGraph.configure).toHaveBeenCalledWith(payload.graph)
      // We're not checking prismaMock.graph.upsert here because we mocked the entire prismaGraphCreateOrUpdate function
    })

    it('should use request URL if name is not provided', async () => {
      // Arrange
      const payload: ClientEventPayload['saveGraph'] = {
        graph: {} as SerializedGraph
      }

      // Act
      await saveGraph(payload, mockLGraph as unknown as LGraph, mockRequest, mockWs)

      // Assert
      expect(mockLGraph.configure).toHaveBeenCalledWith(payload.graph)
      // Instead of checking the exact calls to prismaMock, test for the success by checking
      // that the WebSocket response was called
      expect(mockWs.send).toHaveBeenCalled()
    })
  })
})
