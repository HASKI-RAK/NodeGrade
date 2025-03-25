import { IncomingMessage, ServerResponse } from 'http'
import { ClientBenchmarkPostPayload } from '@haski/ta-lib'
import { handlers } from '../../src/handlers/RequestHandlers'
import * as typeGuards from '../../src/utils/typeGuards'
import { LtiBasicLaunchRequest } from '@haski/lti'

// Mock dependencies
jest.mock('../../src/client', () => ({
  __esModule: true,
  default: {
    graph: {
      findFirst: jest.fn().mockResolvedValue({
        graph: JSON.stringify({ nodes: [] })
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: 'Test Graph', path: '/test' }
      ])
    }
  }
}))

jest.mock('../../src/Graph', () => ({
  addOnNodeAdded: jest.fn(),
  runLgraph: jest.fn().mockResolvedValue({
    findNodesByClass: jest.fn().mockReturnValue([
      { properties: { value: 'test output' } }
    ])
  })
}))

jest.mock('../../src/server', () => ({
  log: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  },
  xAPI: {
    sendStatement: jest.fn()
  }
}))

jest.mock('@haski/ta-lib', () => {
  const original = jest.requireActual('@haski/ta-lib')
  return {
    ...original,
    assertIs: jest.fn(),
    LiteGraph: {
      LGraph: jest.fn().mockImplementation(() => ({
        configure: jest.fn(),
        findNodesByClass: jest.fn().mockReturnValue([{ properties: { value: '' } }])
      }))
    }
  }
}))

jest.mock('../../src/handlers/handleLti', () => ({
  handleLtiToolRegistration: jest.fn().mockResolvedValue({})
}));

describe('Request Handlers', () => {
  let mockRequest: IncomingMessage
  let mockResponse: ServerResponse
  let responseData: string
  let responseStatus: number
  let responseHeaders: Record<string, string>

  beforeEach(() => {
    responseData = ''
    responseStatus = 0
    responseHeaders = {}

    mockRequest = {
      method: 'GET',
      url: '/test',
      headers: {}
    } as unknown as IncomingMessage

    mockResponse = {
      writeHead: jest.fn().mockImplementation((status, headers) => {
        responseStatus = status
        if (headers) {
          responseHeaders = { ...responseHeaders, ...headers }
        }
        return mockResponse
      }),
      write: jest.fn().mockImplementation((data) => {
        responseData = typeof data === 'string' ? data : data.toString()
        return mockResponse
      }),
      end: jest.fn().mockImplementation((data) => {
        if (data) {
          responseData = typeof data === 'string' ? data : data.toString()
        }
        return mockResponse
      }),
      setHeader: jest.fn().mockImplementation((name, value) => {
        responseHeaders[name] = value
      }),
      getHeader: jest.fn().mockImplementation((name) => responseHeaders[name]),
      headersSent: false
    } as unknown as ServerResponse

    jest.clearAllMocks()
  })

  describe('GET handlers', () => {
    it('should handle GET /v1/graphs request', async () => {
      // Act
      await handlers.GET!['/v1/graphs'](mockRequest, mockResponse)

      // Assert
      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')
      
      const parsedResponse = JSON.parse(responseData)
      expect(parsedResponse).toBeInstanceOf(Array)
      expect(parsedResponse.length).toBe(1)
      expect(parsedResponse[0]).toHaveProperty('id', 1)
      expect(parsedResponse[0]).toHaveProperty('name', 'Test Graph')
    })

    it('should handle GET /.well-known/jwks request', async () => {
      // Act
      await handlers.GET!['/.well-known/jwks'](mockRequest, mockResponse)

      // Assert
      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')
      
      const parsedResponse = JSON.parse(responseData)
      expect(parsedResponse).toHaveProperty('kty', 'RSA')
      expect(parsedResponse).toHaveProperty('alg', 'RS256')
    })

    it('should handle GET /policy request', async () => {
      // Act
      await handlers.GET!['/policy'](mockRequest, mockResponse)

      // Assert
      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')
      
      const parsedResponse = JSON.parse(responseData)
      expect(parsedResponse).toHaveProperty('policy')
    })
  })

  describe('POST handlers', () => {
    it('should handle POST /v1/benchmark request with valid payload', async () => {
      // Arrange
      jest.spyOn(typeGuards, 'isClientBenchmarkPostPayload').mockReturnValue(true)
      
      const payload: ClientBenchmarkPostPayload = {
        path: '/test-graph',
        data: {
          question: 'Test question?',
          answer: 'Test answer',
          realAnswer: 'Real answer'
        }
      }

      // Act
      await handlers.POST!['/v1/benchmark'](mockRequest, mockResponse, payload)

      // Assert
      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')
      
      const parsedResponse = JSON.parse(responseData)
      expect(parsedResponse).toEqual(['test output'])
    })

    it('should handle POST /v1/benchmark request with invalid payload', async () => {
      // Arrange
      const mockAssertIs = require('@haski/ta-lib').assertIs as jest.Mock
      mockAssertIs.mockImplementation(() => {
        throw new Error('Invalid payload')
      })
      
      const invalidPayload = { invalid: 'data' }

      // Act & Assert
      await expect(async () => {
        await handlers.POST!['/v1/benchmark'](mockRequest, mockResponse, invalidPayload as any)
      }).not.toThrow()
      
      expect(require('../../src/server').log.error).toHaveBeenCalled()
    })

    it('should handle POST /v1/lti/basiclogin request', async () => {
      // Arrange
      const mockPayload: LtiBasicLaunchRequest = {
        lti_message_type: 'basic-lti-launch-request',
        lti_version: 'LTI-1p0',
        resource_link_id: 123,
        user_id: 456,
        roles: 'Instructor',
        context_id: 123, // Changed from string to number
        context_label: 'Test Context',
        context_title: 'Test Course',
        resource_link_title: 'Test Assignment',
        lis_person_name_given: 'John',
        lis_person_name_family: 'Doe',
        lis_person_name_full: 'John Doe',
        lis_person_contact_email_primary: 'test@example.com',
        launch_presentation_locale: 'en',
        launch_presentation_return_url: 'http://example.com/return',
        tool_consumer_info_product_family_code: 'Test LMS',
        tool_consumer_info_version: '1.0',
        tool_consumer_instance_guid: 'test-guid',
        tool_consumer_instance_name: 'Test Institution',
        tool_consumer_instance_description: 'Test Institution Description',
        custom_activityname: 'test-activity'
      }

      // Act
      await handlers.POST!['/v1/lti/basiclogin'](mockRequest, mockResponse, mockPayload as any)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(302, expect.any(Object))
      expect(responseHeaders.Location).toContain('/ws/editor/')
      expect(responseHeaders.Location).toContain('test-activity')
    })

    it('should handle POST /v1/lti/basiclogin request for student role', async () => {
      // Arrange
      const mockPayload: LtiBasicLaunchRequest = {
        lti_message_type: 'basic-lti-launch-request',
        lti_version: 'LTI-1p0',
        resource_link_id: 123,
        user_id: 456,
        roles: 'Learner',
        context_id: 123, // Changed from string to number
        context_label: 'Test Context',
        context_title: 'Test Course',
        resource_link_title: 'Test Assignment',
        lis_person_name_given: 'John',
        lis_person_name_family: 'Doe',
        lis_person_name_full: 'John Doe',
        lis_person_contact_email_primary: 'test@example.com',
        launch_presentation_locale: 'en',
        launch_presentation_return_url: 'http://example.com/return',
        tool_consumer_info_product_family_code: 'Test LMS',
        tool_consumer_info_version: '1.0',
        tool_consumer_instance_guid: 'test-guid',
        tool_consumer_instance_name: 'Test Institution',
        tool_consumer_instance_description: 'Test Institution Description',
        custom_activityname: 'test-activity'
      }

      // Act
      await handlers.POST!['/v1/lti/basiclogin'](mockRequest, mockResponse, mockPayload as any)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(302, expect.any(Object))
      expect(responseHeaders.Location).toContain('/ws/student/')
      expect(responseHeaders.Location).toContain('test-activity')
    })
  })
})

describe('handleLtiRequest', () => {
  it('should handle basic LTI launch request for instructor', async () => {
    const mockPayload: LtiBasicLaunchRequest = {
      lti_message_type: 'basic-lti-launch-request',
      lti_version: 'LTI-1p0',
      resource_link_id: 123,
      user_id: 456,
      roles: 'Instructor',
      context_id: 789,
      context_label: 'TEST101',
      context_title: 'Test Course',
      context_type: 'CourseSection',
      resource_link_title: 'Test Assignment',
      lis_person_name_given: 'John',
      lis_person_name_family: 'Doe',
      lis_person_name_full: 'John Doe',
      lis_person_contact_email_primary: 'john.doe@example.com',
      launch_presentation_locale: 'en-US',
      custom_activityname: 'Test Activity',
      lis_result_sourcedid: 'course-v1:123+456+789',
      lis_outcome_service_url: 'https://example.com/outcomes',
      ext_user_username: 'jdoe',
      tool_consumer_instance_guid: 'example.com',
      tool_consumer_instance_name: 'Example University',
      tool_consumer_info_product_family_code: 'canvas'
    }
    // ...existing code...
  })

  it('should handle basic LTI launch request for student', async () => {
    const mockPayload: LtiBasicLaunchRequest = {
      lti_message_type: 'basic-lti-launch-request',
      lti_version: 'LTI-1p0',
      resource_link_id: 123,
      user_id: 456,
      roles: 'Learner',
      context_id: 789,
      context_label: 'TEST101',
      context_title: 'Test Course',
      context_type: 'CourseSection',
      resource_link_title: 'Test Assignment',
      lis_person_name_given: 'John',
      lis_person_name_family: 'Doe',
      lis_person_name_full: 'John Doe',
      lis_person_contact_email_primary: 'john.doe@example.com',
      launch_presentation_locale: 'en-US',
      custom_activityname: 'Test Activity',
      lis_result_sourcedid: 'course-v1:123+456+789',
      lis_outcome_service_url: 'https://example.com/outcomes',
      ext_user_username: 'jdoe',
      tool_consumer_instance_guid: 'example.com',
      tool_consumer_instance_name: 'Example University',
      tool_consumer_info_product_family_code: 'canvas'
    }
    // ...existing code...
  })
})
