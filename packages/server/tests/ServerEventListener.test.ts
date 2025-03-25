import { WebSocket } from 'ws'
import { IncomingMessage, ServerResponse } from 'http'
import { EventEmitter } from 'events'
import addListeners from '../src/ServerEventListener'
import { GraphSchema } from '@haski/ta-lib'

// Mock modules
jest.mock('ws', () => {
  return {
    WebSocket: jest.fn()
  }
})

jest.mock('../src/Graph', () => ({
  setupGraphFromPath: jest.fn().mockResolvedValue({
    configure: jest.fn(),
    findNodesByClass: jest.fn().mockReturnValue([])
  })
}))

jest.mock('../src/WebsocketOperations', () => ({
  runGraph: jest.fn(),
  saveGraph: jest.fn()
}))

jest.mock('@haski/ta-lib', () => ({
  handleWsRequest: jest.fn().mockResolvedValue(true),
  WebSocketEvent: jest.fn()
}))

jest.mock('../src/server', () => ({
  log: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  xAPI: {
    sendStatement: jest.fn()
  }
}))

jest.mock('../src/utils/rest', () => ({
  handleRestRequest: jest.fn(),
  handleRestRequestWithPayload: jest.fn(),
  handleRestRequestWithFormData: jest.fn()
}))

describe('ServerEventListener', () => {
  let mockWss: any
  let mockServer: any
  let mockSocket: any
  let mockWs: any
  let mockRequest: IncomingMessage
  let mockResponse: ServerResponse
  let mockHead: Buffer
  let messageHandler: Function

  beforeEach(() => {
    // Create mock WebSocket server
    mockWss = new EventEmitter()
    mockWss.handleUpgrade = jest.fn().mockImplementation((req, socket, head, cb) => {
      cb(mockWs)
    })
    mockWss.emit = jest.fn()

    // Create mock HTTP server
    mockServer = new EventEmitter()

    // Create mock WebSocket client
    mockWs = {
      on: jest.fn().mockImplementation((event, callback) => {
        // Store the callback for message event so we can use it later
        if (event === 'message') {
          messageHandler = callback
        }
        return mockWs
      }),
      send: jest.fn()
    }

    // Create mock request and response
    mockRequest = {
      url: '/ws/test',
      method: 'GET',
      headers: {
        'content-type': 'application/json'
      },
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'end') callback()
        return mockRequest
      })
    } as unknown as IncomingMessage

    mockResponse = {
      writeHead: jest.fn().mockReturnThis(),
      write: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      getHeader: jest.fn().mockReturnValue(null),
      headersSent: false
    } as unknown as ServerResponse

    mockSocket = {
      destroy: jest.fn(),
      write: jest.fn()
    }

    mockHead = Buffer.from([])

    jest.clearAllMocks()
  })

  it('should add WebSocket connection listener to wss', async () => {
    // Act
    await addListeners(mockWss, mockServer)

    // Assert
    expect(mockWss.listenerCount('connection')).toBe(1)
  })

  it('should handle WebSocket connections and set up message handler', async () => {
    // Arrange
    await addListeners(mockWss, mockServer)
    const connectionHandler = mockWss.listeners('connection')[0]

    // Act
    await connectionHandler(mockWs, mockRequest)

    // Assert
    expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function))
    expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(require('../src/Graph').setupGraphFromPath).toHaveBeenCalledWith(
      mockWs,
      '/ws/test'
    )
  })

  it('should handle WebSocket messages and process them', async () => {
    // Arrange
    const handleWsRequestMock = require('@haski/ta-lib').handleWsRequest
    await addListeners(mockWss, mockServer)
    const connectionHandler = mockWss.listeners('connection')[0]
    await connectionHandler(mockWs, mockRequest)

    // Create a mock message event
    const mockEvent = {
      eventName: 'runGraph',
      data: { graph: {}, answer: 'test' }
    }
    const message = Buffer.from(JSON.stringify(mockEvent))

    // Act - directly call the saved message handler
    await messageHandler(message)

    // Assert
    expect(handleWsRequestMock).toHaveBeenCalledWith(mockEvent, expect.any(Object))
  })

  it('should add HTTP request listener to server', async () => {
    // Act
    await addListeners(mockWss, mockServer)

    // Assert
    expect(mockServer.listenerCount('request')).toBe(1)
  })

  it('should handle HTTP GET requests', async () => {
    // Arrange
    const handleRestRequestMock = require('../src/utils/rest').handleRestRequest
    await addListeners(mockWss, mockServer)
    const requestHandler = mockServer.listeners('request')[0]

    // Create mock response data
    const mockGraphs = [
      { id: 1, path: '/test1', graph: '{}' },
      { id: 2, path: '/test2', graph: '{}' }
    ]

    // Mock handleRestRequest to write response
    handleRestRequestMock.mockImplementationOnce(async (req, res) => {
      res.write(JSON.stringify(mockGraphs))
    })

    // Act
    await requestHandler(mockRequest, mockResponse)

    // Assert
    expect(handleRestRequestMock).toHaveBeenCalledWith(
      mockRequest,
      mockResponse,
      expect.objectContaining({
        method: 'GET',
        route: '/ws/test'
      }),
      expect.any(Object)
    )
    expect(mockResponse.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json'
    })
  })

  it('should handle HTTP POST requests with JSON content type', async () => {
    // Arrange
    const handleRestRequestWithPayloadMock =
      require('../src/utils/rest').handleRestRequestWithPayload
    mockRequest.method = 'POST'
    mockRequest.headers['content-type'] = 'application/json'

    await addListeners(mockWss, mockServer)
    const requestHandler = mockServer.listeners('request')[0]

    // Act
    await requestHandler(mockRequest, mockResponse)

    // Assert
    expect(handleRestRequestWithPayloadMock).toHaveBeenCalledWith(
      mockRequest,
      'POST',
      '/ws/test',
      mockResponse
    )
  })

  it('should handle WebSocket upgrade requests for valid paths', async () => {
    // Arrange
    mockRequest.url = '/ws/valid-path'

    await addListeners(mockWss, mockServer)
    const upgradeHandler = mockServer.listeners('upgrade')[0]

    // Act
    upgradeHandler(mockRequest, mockSocket, mockHead)

    // Assert
    expect(mockWss.handleUpgrade).toHaveBeenCalledWith(
      mockRequest,
      mockSocket,
      mockHead,
      expect.any(Function)
    )
    expect(mockWss.emit).toHaveBeenCalledWith('connection', mockWs, mockRequest)
  })

  it('should reject WebSocket upgrade requests for invalid paths', async () => {
    // Arrange
    mockRequest.url = '/invalid/path'

    await addListeners(mockWss, mockServer)
    const upgradeHandler = mockServer.listeners('upgrade')[0]

    // Act
    upgradeHandler(mockRequest, mockSocket, mockHead)

    // Assert
    expect(mockWss.handleUpgrade).not.toHaveBeenCalled()
    expect(mockSocket.destroy).toHaveBeenCalled()
  })
})
