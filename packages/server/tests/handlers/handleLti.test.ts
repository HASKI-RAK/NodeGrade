import { IncomingMessage, ServerResponse } from 'http'
import {
  handleLtiToolRegistration,
  extractLtiLaunchRequest,
  extractBasicLtiLaunchRequest
} from '../../src/handlers/handleLti'
import { LtiBasicLaunchRequest } from '@haski/lti'

describe('LTI Handlers', () => {
  let mockRequest: IncomingMessage & { body?: any }
  let mockResponse: ServerResponse
  let responseData: string
  let responseStatus: number
  let responseHeaders: Record<string, string>

  beforeEach(() => {
    responseData = ''
    responseStatus = 0
    responseHeaders = {}

    mockRequest = {
      method: 'POST',
      url: '/test',
      headers: {}
    } as IncomingMessage & { body?: any }

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

  describe('handleLtiToolRegistration', () => {
    it('should handle LTI tool registration requests', async () => {
      // Arrange
      const mockPayload = {
        registration: {
          response: {
            toolConfiguration: {
              deployment_id: 'test-deployment'
            }
          }
        }
      }

      Object.defineProperty(mockRequest, 'body', {
        value: mockPayload,
        writable: true
      })

      // Act
      await handleLtiToolRegistration(mockRequest, mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'application/json'
        })
      )
      expect(responseData).toBeTruthy()
      const response = JSON.parse(responseData)
      expect(response).toHaveProperty('deployment_id', 'test-deployment')
    })

    it('should handle LTI tool registration', async () => {
      // Arrange
      const mockPayload = {
        id_token: 'test-token',
        state: 'test-state',
        resource_link_title: 'Test Activity',
        custom_activityname: 'test-activity'
      }

      Object.defineProperty(mockRequest, 'body', {
        value: mockPayload,
        writable: true
      })

      // Act
      await handleLtiToolRegistration(mockRequest, mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(302, expect.any(Object))
      expect(responseHeaders.Location).toContain('/ws/editor/')
      expect(responseHeaders.Location).toContain('test-activity')
    })

    it('should handle basic LTI launch request for instructor', async () => {
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

      Object.defineProperty(mockRequest, 'body', {
        value: mockPayload,
        writable: true
      })

      // Act
      await handleLtiToolRegistration(mockRequest, mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(302, expect.any(Object))
      expect(responseHeaders.Location).toContain('/ws/editor/')
      expect(responseHeaders.Location).toContain('test-activity')
    })

    it('should handle basic LTI launch request for student', async () => {
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

      Object.defineProperty(mockRequest, 'body', {
        value: mockPayload,
        writable: true
      })

      // Act
      await handleLtiToolRegistration(mockRequest, mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalledWith(302, expect.any(Object))
      expect(responseHeaders.Location).toContain('/ws/student/')
      expect(responseHeaders.Location).toContain('test-activity')
    })
  })

  describe('extractLtiLaunchRequest', () => {
    it('should extract LTI launch request data from URL parameters', () => {
      // Arrange
      const params = new URLSearchParams()
      params.append('id_token', 'test-token')
      params.append('state', 'test-state')

      // Act
      const result = extractLtiLaunchRequest(params)

      // Assert
      expect(result).toBeTruthy()
      expect(result).toHaveProperty('id_token', 'test-token')
      expect(result).toHaveProperty('state', 'test-state')
    })

    it('should extract all provided parameters', () => {
      // Arrange
      const params = new URLSearchParams()
      params.append('id_token', 'test-token')
      params.append('state', 'test-state')
      params.append('custom_param', 'custom-value')

      // Act
      const result = extractLtiLaunchRequest(params)

      // Assert
      expect(result).toBeTruthy()
      expect(result).toHaveProperty('id_token', 'test-token')
      expect(result).toHaveProperty('state', 'test-state')
      expect(result).toHaveProperty('custom_param', 'custom-value')
    })
  })

  describe('extractBasicLtiLaunchRequest', () => {
    it('should extract basic LTI launch request data from URL parameters', () => {
      // Arrange
      const params = new URLSearchParams()
      params.append('lti_message_type', 'basic-lti-launch-request')
      params.append('lti_version', 'LTI-1p0')
      params.append('resource_link_id', '123')
      params.append('user_id', '456')
      params.append('roles', 'Instructor')

      // Act
      const result = extractBasicLtiLaunchRequest(params)

      // Assert
      expect(result).toBeTruthy()
      expect(result).toHaveProperty('lti_message_type', 'basic-lti-launch-request')
      expect(result).toHaveProperty('lti_version', 'LTI-1p0')
      expect(result).toHaveProperty('resource_link_id', 123)
      expect(result).toHaveProperty('user_id', 456)
      expect(result).toHaveProperty('roles', 'Instructor')
    })

    it('should return null for non-basic LTI request', () => {
      // Arrange
      const params = new URLSearchParams()
      params.append('other_param', 'value')

      // Act
      const result = extractBasicLtiLaunchRequest(params)

      // Assert
      expect(result).toBeNull()
    })

    it('should handle missing required parameters', () => {
      // Arrange
      const params = new URLSearchParams()
      params.append('lti_message_type', 'basic-lti-launch-request')
      // Missing other required parameters

      // Act
      const result = extractBasicLtiLaunchRequest(params)

      // Assert
      expect(result).toBeNull()
    })

    it('should extract basic LTI launch request data', () => {
      // Arrange
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
      // Act
      const result = extractBasicLtiLaunchRequest(new URLSearchParams(mockPayload as any))

      // Assert
      expect(result).toBeTruthy()
      expect(result).toHaveProperty('lti_message_type', 'basic-lti-launch-request')
      expect(result).toHaveProperty('lti_version', 'LTI-1p0')
      expect(result).toHaveProperty('resource_link_id', 123)
      expect(result).toHaveProperty('user_id', 456)
      expect(result).toHaveProperty('roles', 'Instructor')
      expect(result).toHaveProperty('context_id', 789)
      expect(result).toHaveProperty('context_label', 'TEST101')
      expect(result).toHaveProperty('context_title', 'Test Course')
      expect(result).toHaveProperty('context_type', 'CourseSection')
      expect(result).toHaveProperty('resource_link_title', 'Test Assignment')
      expect(result).toHaveProperty('lis_person_name_given', 'John')
      expect(result).toHaveProperty('lis_person_name_family', 'Doe')
      expect(result).toHaveProperty('lis_person_name_full', 'John Doe')
      expect(result).toHaveProperty(
        'lis_person_contact_email_primary',
        'john.doe@example.com'
      )
      expect(result).toHaveProperty('launch_presentation_locale', 'en-US')
      expect(result).toHaveProperty('custom_activityname', 'Test Activity')
      expect(result).toHaveProperty('lis_result_sourcedid', 'course-v1:123+456+789')
      expect(result).toHaveProperty(
        'lis_outcome_service_url',
        'https://example.com/outcomes'
      )
      expect(result).toHaveProperty('ext_user_username', 'jdoe')
      expect(result).toHaveProperty('tool_consumer_instance_guid', 'example.com')
      expect(result).toHaveProperty('tool_consumer_instance_name', 'Example University')
      expect(result).toHaveProperty('tool_consumer_info_product_family_code', 'canvas')
    })

    it('should validate basic LTI launch request data', () => {
      // Arrange
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
      // Act
      const result = extractBasicLtiLaunchRequest(new URLSearchParams(mockPayload as any))

      // Assert
      expect(result).toBeTruthy()
      expect(result).toHaveProperty('lti_message_type', 'basic-lti-launch-request')
      expect(result).toHaveProperty('lti_version', 'LTI-1p0')
      expect(result).toHaveProperty('resource_link_id', 123)
      expect(result).toHaveProperty('user_id', 456)
      expect(result).toHaveProperty('roles', 'Instructor')
      expect(result).toHaveProperty('context_id', 789)
      expect(result).toHaveProperty('context_label', 'TEST101')
      expect(result).toHaveProperty('context_title', 'Test Course')
      expect(result).toHaveProperty('context_type', 'CourseSection')
      expect(result).toHaveProperty('resource_link_title', 'Test Assignment')
      expect(result).toHaveProperty('lis_person_name_given', 'John')
      expect(result).toHaveProperty('lis_person_name_family', 'Doe')
      expect(result).toHaveProperty('lis_person_name_full', 'John Doe')
      expect(result).toHaveProperty(
        'lis_person_contact_email_primary',
        'john.doe@example.com'
      )
      expect(result).toHaveProperty('launch_presentation_locale', 'en-US')
      expect(result).toHaveProperty('custom_activityname', 'Test Activity')
      expect(result).toHaveProperty('lis_result_sourcedid', 'course-v1:123+456+789')
      expect(result).toHaveProperty(
        'lis_outcome_service_url',
        'https://example.com/outcomes'
      )
      expect(result).toHaveProperty('ext_user_username', 'jdoe')
      expect(result).toHaveProperty('tool_consumer_instance_guid', 'example.com')
      expect(result).toHaveProperty('tool_consumer_instance_name', 'Example University')
      expect(result).toHaveProperty('tool_consumer_info_product_family_code', 'canvas')
    })
  })
})
