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
        id: 1,
        path: '/test-graph',
        graph: JSON.stringify({ nodes: [] })
      }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'Test Graph', path: '/test' }])
    }
  }
}))

jest.mock('../../src/Graph', () => ({
  addOnNodeAdded: jest.fn(),
  runLgraph: jest.fn().mockResolvedValue({
    findNodesByClass: jest
      .fn()
      .mockReturnValue([{ properties: { value: 'test output' } }])
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
})

jest.mock('@haski/lti', () => ({
  isPayloadLtiLaunchValid: jest.fn(),
  handleLtiToolRegistration: jest.fn(),
  LtiBasicLaunchRequest: jest.fn()
}))

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

    // Update mock implementation
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
      await handlers.GET!['/v1/graphs'](mockRequest, mockResponse)

      const expectedResponse = [{ id: 1, name: 'Test Graph', path: '/test' }]

      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')
      expect(responseHeaders['Access-Control-Allow-Origin']).toBe('*')
      expect(responseData).toBe(JSON.stringify(expectedResponse))
    })

    it('should handle GET /.well-known/jwks request', async () => {
      await handlers.GET!['/.well-known/jwks'](mockRequest, mockResponse)

      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')

      const parsedResponse = JSON.parse(responseData)
      expect(parsedResponse).toHaveProperty('kty', 'RSA')
      expect(parsedResponse).toHaveProperty('alg', 'RS256')
    })

    it('should handle GET /policy request', async () => {
      await handlers.GET!['/policy'](mockRequest, mockResponse)

      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')

      const parsedResponse = JSON.parse(responseData)
      expect(parsedResponse).toHaveProperty('policy')
    })
  })

  describe('POST handlers', () => {
    it('should handle POST /v1/benchmark request with valid payload', async () => {
      // Mock isClientBenchmarkPostPayload to return true
      jest.spyOn(typeGuards, 'isClientBenchmarkPostPayload').mockReturnValue(true)

      // Mock the graph lookup to return a valid graph
      const prismaClient = require('../../src/client').default
      prismaClient.graph.findFirst.mockResolvedValue({
        id: 1,
        path: '/test-graph',
        graph: JSON.stringify({ nodes: [] })
      })

      const payload: ClientBenchmarkPostPayload = {
        path: '/test-graph',
        data: {
          question: 'Test question?',
          answer: 'Test answer',
          realAnswer: 'Real answer'
        }
      }

      await handlers.POST!['/v1/benchmark'](mockRequest, mockResponse, payload)

      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toBe('application/json')
      expect(responseData).toBe(JSON.stringify(['test output']))
    })

    it('should handle POST /v1/benchmark request with invalid payload', async () => {
      jest.spyOn(typeGuards, 'isClientBenchmarkPostPayload').mockReturnValue(false)

      const invalidPayload = { invalid: 'data' }
      await handlers.POST!['/v1/benchmark'](
        mockRequest,
        mockResponse,
        invalidPayload as any
      )

      expect(require('../../src/server').log.error).toHaveBeenCalled()
    })

    describe('LTI handlers', () => {
      const baseLtiPayload: LtiBasicLaunchRequest = {
        lti_message_type: 'basic-lti-launch-request',
        lti_version: 'LTI-1p0',
        resource_link_id: 123,
        user_id: 456,
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
        custom_activityname: 'test-activity',
        lis_result_sourcedid: {
          data: {
            instanceid: 'test-instance',
            userid: 'test-user',
            typeid: null,
            launchid: 123
          },
          hash: 'test-hash'
        },
        lis_outcome_service_url: 'https://example.com/outcomes',
        ext_user_username: 'jdoe',
        ext_lms: 'test-lms',
        tool_consumer_info_product_family_code: 'canvas',
        tool_consumer_info_version: '1.0',
        tool_consumer_instance_guid: 'example.com',
        tool_consumer_instance_name: 'Example University',
        tool_consumer_instance_description: 'Test Institution Description',
        launch_presentation_document_target: 'iframe',
        launch_presentation_return_url: 'http://example.com/return',
        oauth_callback: 'about:blank',
        roles: 'Instructor'
      }

      it('should handle POST /v1/lti/basiclogin for instructor role', async () => {
        const payload = { ...baseLtiPayload, roles: 'Instructor' }
        await handlers.POST!['/v1/lti/basiclogin'](mockRequest, mockResponse, payload)

        expect(responseStatus).toBe(302)
        const location = responseHeaders.Location as string
        expect(location).toContain('/ws/editor/')
        expect(location).toContain('test-activity')
        expect(location).toContain('user_id=456')
      })

      it('should handle POST /v1/lti/basiclogin for student role', async () => {
        const payload = { ...baseLtiPayload, roles: 'Learner' }
        await handlers.POST!['/v1/lti/basiclogin'](mockRequest, mockResponse, payload)

        expect(responseStatus).toBe(302)
        const location = responseHeaders.Location as string
        expect(location).toContain('/ws/student/')
        expect(location).toContain('test-activity')
        expect(location).toContain('user_id=456')
      })

      it('should handle errors in POST /v1/lti/basiclogin', async () => {
        const xAPIMock = require('../../src/server').xAPI.sendStatement as jest.Mock
        xAPIMock.mockImplementation(() => {
          throw new Error('XAPI Error')
        })

        await handlers.POST!['/v1/lti/basiclogin'](
          mockRequest,
          mockResponse,
          baseLtiPayload
        )

        expect(require('../../src/server').log.error).toHaveBeenCalledWith(
          'Invalid Tool Launch Request'
        )
      })
    })
  })
})
