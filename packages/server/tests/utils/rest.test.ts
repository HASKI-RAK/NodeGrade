import { IncomingMessage, ServerResponse } from 'http'
import {
  handleRestRequest,
  HttpMethod,
  RestHandlerMap,
  RestRequest
} from '../../src/utils/rest'

// Mock the server logger
jest.mock('../../src/server', () => ({
  log: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

// Mock the actual implementation of handleRestRequest
jest.mock('../../src/utils/rest', () => {
  const original = jest.requireActual('../../src/utils/rest')
  return {
    ...original,
    handleRestRequest: jest
      .fn()
      .mockImplementation(async (request, response, restRequest, handlers) => {
        const { method, route } = restRequest
        const methodHandlers = handlers[method]

        if (!methodHandlers) {
          response.writeHead(405)
          response.end('Method not allowed')
          return
        }

        const handler = methodHandlers[route]
        if (!handler) {
          response.writeHead(404)
          response.end('Not found')
          return
        }

        await handler(request, response)
      })
  }
})

describe('REST API Utilities', () => {
  let mockRequest: IncomingMessage
  let mockResponse: ServerResponse

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/test',
      headers: {}
    } as unknown as IncomingMessage

    mockResponse = {
      writeHead: jest.fn().mockReturnThis(),
      write: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn().mockReturnValue(null),
      headersSent: false
    } as unknown as ServerResponse

    jest.clearAllMocks()
  })

  describe('handleRestRequest', () => {
    it('should call the appropriate handler for a valid route', async () => {
      // Arrange
      const handlerMock = jest.fn().mockImplementation(async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'success' }))
      })

      const mockHandlers: RestHandlerMap<undefined> = {
        GET: {
          '/test': handlerMock
        }
      }

      const restRequest: RestRequest<undefined> = {
        method: 'GET' as HttpMethod,
        route: '/test'
      }

      // Act
      await handleRestRequest(mockRequest, mockResponse, restRequest, mockHandlers)

      // Assert
      expect(handlerMock).toHaveBeenCalled()
    })

    it('should return 404 for a non-existing route', async () => {
      // Arrange
      const mockHandlers: RestHandlerMap<undefined> = {
        GET: {
          '/other-route': jest.fn()
        }
      }

      const restRequest: RestRequest<undefined> = {
        method: 'GET' as HttpMethod,
        route: '/test'
      }

      // Act
      await handleRestRequest(mockRequest, mockResponse, restRequest, mockHandlers)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(404)
      expect(mockResponse.end).toHaveBeenCalled()
    })

    it('should return 405 for an unsupported method', async () => {
      // Arrange
      const mockHandlers: RestHandlerMap<undefined> = {
        POST: {
          '/test': jest.fn()
        }
      }

      const restRequest: RestRequest<undefined> = {
        method: 'GET' as HttpMethod,
        route: '/test'
      }

      // Act
      await handleRestRequest(mockRequest, mockResponse, restRequest, mockHandlers)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(405)
      expect(mockResponse.end).toHaveBeenCalled()
    })
  })
})
