const customFn = jest.fn()
import { LGraph, LGraphNode, LiteGraph, QuestionNode, sendWs } from '@haski/ta-lib'
import { ImageNode } from '@haski/ta-lib/nodes/ImageNode'
import { WebSocket } from 'ws'

import { prismaMock } from '../singleton'
import {
  addOnNodeAdded,
  runLgraph,
  sendImages,
  sendQuestion,
  setupGraphFromPath
} from '../src/Graph'

// Mock dependencies

jest.mock('@haski/ta-lib', () => {
  const original = jest.requireActual('@haski/ta-lib')
  return {
    ...original,
    sendWs: customFn,
    LiteGraph: {
      ...original.LiteGraph,
      NODE_DEFAULT_COLOR: 'defaultColor',
      LGraph: jest.fn().mockImplementation(() => ({
        configure: jest.fn(),
        findNodesByClass: jest.fn().mockReturnValue([]),
        computeExecutionOrder: jest.fn().mockReturnValue([]),
        serialize: jest.fn().mockReturnValue({}),
        clear: jest.fn(),
        onNodeAdded: null
      }))
    }
  }
})

jest.mock('../src/server', () => ({
  log: {
    debug: jest.fn(),
    trace: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}))

describe('Graph Module', () => {
  let mockWs: WebSocket
  let mockLGraph: any

  beforeEach(() => {
    mockWs = {
      send: jest.fn()
    } as unknown as WebSocket

    mockLGraph = {
      configure: jest.fn(),
      findNodesByClass: jest.fn(),
      computeExecutionOrder: jest.fn(),
      serialize: jest.fn().mockReturnValue({}),
      clear: jest.fn(),
      onNodeAdded: jest.fn()
    } as unknown as LGraph

    jest.clearAllMocks()
  })

  describe('setupGraphFromPath', () => {
    it('should load a graph from the database if it exists', async () => {
      // Arrange
      const pathname = '/ws/test-graph'
      const graphData = {
        id: 1,
        path: pathname,
        graph: '{"nodes": [], "links": []}',
        created_at: new Date(),
        updated_at: new Date()
      }

      prismaMock.graph.findFirst.mockResolvedValue(graphData)

      // Act
      const result = await setupGraphFromPath(mockWs, pathname)

      // Assert
      expect(prismaMock.graph.findFirst).toHaveBeenCalledWith({
        where: { path: pathname }
      })
      // Since setupGraphFromPath creates a new LGraph and we can't intercept that,
      // we'll just check that it returns something
      expect(result).toBeTruthy()
    })

    it('should create a test graph if no graph exists in the database', async () => {
      // Arrange
      const pathname = '/ws/non-existent-graph'

      prismaMock.graph.findFirst.mockResolvedValue(null)

      // Act
      const result = await setupGraphFromPath(mockWs, pathname)

      // Assert
      expect(result).toBeTruthy()
      // The function should have tried to load a test graph
    })
  })

  describe('addOnNodeAdded', () => {
    it('should set onNodeAdded function for the graph', () => {
      // Act
      addOnNodeAdded(mockLGraph, mockWs)

      // Assert
      expect(mockLGraph.onNodeAdded).toBeTruthy()
    })
  })

  describe('sendQuestion', () => {
    it('should send a question if a QuestionNode exists', () => {
      // Arrange
      const mockQuestionNode = {
        properties: {
          value: 'Test question?'
        }
      }

      mockLGraph.findNodesByClass.mockImplementation((cls: any) => {
        if (cls === QuestionNode) {
          return [mockQuestionNode]
        }
        return []
      })

      // Act
      sendQuestion(mockLGraph, mockWs)

      // Assert
      expect(mockLGraph.findNodesByClass).toHaveBeenCalledWith(QuestionNode)
      expect(customFn).toHaveBeenCalled()
    })

    it('should not send a question if no QuestionNode exists', () => {
      // Arrange
      mockLGraph.findNodesByClass.mockReturnValue([])

      // Act
      sendQuestion(mockLGraph, mockWs)

      // Assert
      expect(mockLGraph.findNodesByClass).toHaveBeenCalledWith(QuestionNode)
      expect(customFn).not.toHaveBeenCalled()
    })
  })

  describe('sendImages', () => {
    it('should send images for all ImageNodes with imageUrl', () => {
      // Arrange
      const mockImageNodes = [
        { properties: { imageUrl: 'image1.jpg', properties_info: 'info1' } },
        { properties: { imageUrl: 'image2.jpg', properties_info: 'info2' } },
        { properties: { properties_info: 'info3' } } // No imageUrl
      ]

      mockLGraph.findNodesByClass.mockImplementation((cls: any) => {
        if (cls === ImageNode) {
          return mockImageNodes
        }
        return []
      })

      // Act
      sendImages(mockWs, mockLGraph)

      // Assert
      expect(mockLGraph.findNodesByClass).toHaveBeenCalledWith(ImageNode)
      // Should send 2 messages (for the 2 nodes with imageUrl)
      expect(customFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('runLgraph', () => {
    it('should run each node in the execution order', async () => {
      // Arrange
      const mockNodes = [
        { onExecute: jest.fn().mockResolvedValue(undefined) },
        { onExecute: jest.fn().mockResolvedValue(undefined) },
        { onExecute: jest.fn().mockResolvedValue(undefined) }
      ]

      mockLGraph.computeExecutionOrder.mockReturnValue(mockNodes)
      const updateProgressCb = jest.fn()

      // Act
      const result = await runLgraph(mockLGraph, updateProgressCb)

      // Assert
      expect(mockLGraph.computeExecutionOrder).toHaveBeenCalledWith(false, true)
      mockNodes.forEach((node) => {
        expect(node.onExecute).toHaveBeenCalled()
      })
      expect(updateProgressCb).toHaveBeenCalledTimes(mockNodes.length)
      expect(result).toBe(mockLGraph)
    })

    it('should handle errors in node execution', async () => {
      // Arrange
      const mockNodes = [
        { onExecute: jest.fn().mockResolvedValue(undefined) },
        { onExecute: jest.fn().mockRejectedValue(new Error('Test error')) },
        { onExecute: jest.fn().mockResolvedValue(undefined) }
      ]

      mockLGraph.computeExecutionOrder.mockReturnValue(mockNodes)

      // Act
      const result = await runLgraph(mockLGraph)

      // Assert
      expect(mockNodes[0].onExecute).toHaveBeenCalled()
      expect(mockNodes[1].onExecute).toHaveBeenCalled()
      expect(mockNodes[2].onExecute).toHaveBeenCalled() // Should still call this despite error
      expect(result).toBe(mockLGraph)
    })
  })
})
