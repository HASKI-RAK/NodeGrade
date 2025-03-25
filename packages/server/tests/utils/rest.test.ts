import { IncomingMessage, ServerResponse } from 'http'
import {
  handleRestRequest,
  handleRestRequestWithFormData,
  handleRestRequestWithPayload,
  RestRequest
} from '../../src/utils/rest'
import {
  extractLtiLaunchRequest,
  extractBasicLtiLaunchRequest
} from '../../src/handlers/handleLti'

// Mock the LTI handlers
jest.mock('../../src/handlers/handleLti', () => ({
  extractLtiLaunchRequest: jest.fn(),
  extractBasicLtiLaunchRequest: jest.fn()
}))

describe('REST Utils', () => {
  let mockRequest: IncomingMessage
  let mockResponse: ServerResponse
  let mockHandlers: Record<string, Record<string, Function>>
  let mockHandler: jest.Mock
  let requestBody: Buffer[]

  beforeEach(() => {
    requestBody = []
    mockHandler = jest.fn()
    mockHandlers = {
      POST: {
        '/test': mockHandler
      }
    }

    mockRequest = {
      method: 'POST',
      url: '/test',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'data') {
          requestBody.forEach((chunk) => callback(chunk))
        }
        if (event === 'end') {
          callback()
        }
        return mockRequest
      })
    } as unknown as IncomingMessage

    mockResponse = {
      writeHead: jest.fn().mockReturnThis(),
      write: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      headersSent: false
    } as unknown as ServerResponse

    jest.clearAllMocks()
  })

  describe('handleRestRequestWithFormData', () => {
    it('should handle LTI launch requests', async () => {
      // Arrange
      const ltiData = { id_token: 'test-token', state: 'test-state' }
      ;(extractLtiLaunchRequest as jest.Mock).mockReturnValue(ltiData)
      requestBody = [Buffer.from('id_token=test-token&state=test-state')]

      // Act
      await handleRestRequestWithFormData(mockRequest, 'POST', '/test', mockResponse)

      // Assert
      expect(extractLtiLaunchRequest).toHaveBeenCalled()
      expect(mockHandler).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        expect.objectContaining(ltiData)
      )
    })

    it('should handle basic LTI launch requests', async () => {
      // Arrange
      const basicLtiData = {
        lti_message_type: 'basic-lti-launch-request',
        lti_version: 'LTI-1p0',
        resource_link_id: 123,
        user_id: 456,
        roles: 'Instructor'
      }
      ;(extractBasicLtiLaunchRequest as jest.Mock).mockReturnValue(basicLtiData)
      requestBody = [
        Buffer.from(
          'lti_message_type=basic-lti-launch-request&lti_version=LTI-1p0&resource_link_id=123&user_id=456&roles=Instructor'
        )
      ]

      // Act
      await handleRestRequestWithFormData(mockRequest, 'POST', '/test', mockResponse)

      // Assert
      expect(extractBasicLtiLaunchRequest).toHaveBeenCalled()
      expect(mockHandler).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        expect.objectContaining(basicLtiData)
      )
    })

    it('should handle malformed form data', async () => {
      // Arrange
      requestBody = [Buffer.from('invalid=data&broken%syntax')]

      // Act
      await handleRestRequestWithFormData(mockRequest, 'POST', '/test', mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, {
        'Content-Type': 'text/plain'
      })
      expect(mockResponse.end).toHaveBeenCalledWith('Invalid form data')
    })

    it('should handle empty form data', async () => {
      // Arrange
      requestBody = [Buffer.from('')]

      // Act
      await handleRestRequestWithFormData(mockRequest, 'POST', '/test', mockResponse)

      // Assert
      expect(mockHandler).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        expect.any(Object)
      )
    })
  })

  describe('handleRestRequestWithPayload', () => {
    beforeEach(() => {
      mockRequest.headers['content-type'] = 'application/json'
    })

    it('should parse JSON payload and call handleRestRequest', async () => {
      // Arrange
      const payload = { key: 'value' }
      requestBody = [Buffer.from(JSON.stringify(payload))]

      // Act
      await handleRestRequestWithPayload(mockRequest, 'POST', '/test', mockResponse)

      // Assert
      expect(mockHandler).toHaveBeenCalledWith(mockRequest, mockResponse, payload)
    })

    it('should handle JSON parsing errors', async () => {
      // Arrange
      requestBody = [Buffer.from('invalid json')]

      // Act
      await handleRestRequestWithPayload(mockRequest, 'POST', '/test', mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, {
        'Content-Type': 'text/plain'
      })
      expect(mockResponse.end).toHaveBeenCalledWith('Invalid JSON payload')
    })

    it('should handle empty payload', async () => {
      // Arrange
      requestBody = [Buffer.from('')]

      // Act
      await handleRestRequestWithPayload(mockRequest, 'POST', '/test', mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, {
        'Content-Type': 'text/plain'
      })
      expect(mockResponse.end).toHaveBeenCalledWith('Empty payload')
    })
  })

  describe('handleRestRequest', () => {
    it('should handle errors thrown by handlers', async () => {
      // Arrange
      const mockHandlerWithError = jest.fn().mockImplementation(() => {
        throw new Error('Test error')
      })
      mockHandlers.POST!['/test'] = mockHandlerWithError

      const restRequest: RestRequest<{}> = {
        method: 'POST',
        route: '/test',
        payload: {}
      }

      // Act
      await handleRestRequest(mockRequest, mockResponse, restRequest, mockHandlers)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(500, {
        'Content-Type': 'text/plain'
      })
      expect(mockResponse.end).toHaveBeenCalledWith('Internal Server Error')
    })
  })
})

describe('RestRequest', () => {
  it('should handle different HTTP methods', () => {
    const methods: ('GET' | 'POST' | 'PUT' | 'DELETE')[] = [
      'GET',
      'POST',
      'PUT',
      'DELETE'
    ]
    methods.forEach((method) => {
      const request = new RestRequest('/test', { method })
      expect(request.method).toBe(method)
    })
  })

  it('should handle form data', () => {
    const formData = new FormData()
    formData.append('test', 'value')

    const request = new RestRequest('/test', {
      method: 'POST',
      body: formData
    })

    expect(request.headers.get('Content-Type')).toBeNull() // FormData sets its own boundary
    expect(request.body).toBe(formData)
  })

  it('should handle JSON data', () => {
    const jsonData = { test: 'value' }

    const request = new RestRequest('/test', {
      method: 'POST',
      body: JSON.stringify(jsonData),
      headers: {
        'Content-Type': 'application/json'
      }
    })

    expect(request.headers.get('Content-Type')).toBe('application/json')
    expect(request.body).toBe(JSON.stringify(jsonData))
  })
})
