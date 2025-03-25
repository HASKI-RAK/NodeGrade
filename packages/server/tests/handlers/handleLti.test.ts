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
        openid_configuration: 'https://test.com/config',
        registration_token: 'test-token'
      }

      Object.defineProperty(mockRequest, 'url', {
        value: '/test?' + new URLSearchParams(mockPayload).toString(),
        writable: true
      })

      // Mock fetch for OpenID configuration
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              registration_endpoint: 'https://test.com/register',
              issuer: 'test-issuer',
              authorization_endpoint: 'test-auth',
              'https://purl.imsglobal.org/spec/lti-platform-configuration': {
                product_family_code: 'test-family',
                version: '1.0',
                variables: []
              }
            })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              client_id: 'test-client',
              response_types: ['id_token'],
              jwks_uri: 'test-jwks',
              initiate_login_uri: 'test-login',
              grant_types: ['implicit'],
              redirect_uris: ['test-uri'],
              application_type: 'web',
              token_endpoint_auth_method: 'private_key_jwt',
              client_name: 'Test Client',
              logo_uri: 'test-logo',
              scope: 'test-scope',
              'https://purl.imsglobal.org/spec/lti-tool-configuration': {
                deployment_id: 'test-deployment',
                version: '1.0',
                target_link_uri: 'test-uri',
                domain: 'test.com',
                description: 'test',
                claims: []
              },
              scopes_supported: ['test-scope'],
              response_types_supported: ['id_token'],
              subject_types_supported: ['public'],
              id_token_signing_alg_values_supported: ['RS256'],
              claims_supported: ['sub']
            })
        })

      // Act
      await handleLtiToolRegistration(mockRequest, mockResponse)

      // Assert
      expect(mockResponse.writeHead).toHaveBeenCalled()
      expect(responseData).toBeTruthy()
    }, 15000) // Increase timeout to 15 seconds

    it('should handle LTI launch request', async () => {
      // Arrange
      const mockPayload = {
        iss: 'test-issuer',
        target_link_uri: 'test-uri',
        login_hint: 'test-hint',
        lti_message_hint: 'test-message',
        client_id: 'test-client',
        lti_deployment_id: 'test-deployment'
      }

      Object.defineProperty(mockRequest, 'url', {
        value: '/test?' + new URLSearchParams(mockPayload).toString(),
        writable: true
      })

      // Act
      const result = extractLtiLaunchRequest(new URLSearchParams(mockPayload))

      // Assert
      expect(result).toBeTruthy()
      expect(result).toEqual(mockPayload)
    })

    it('should handle basic LTI launch request for instructor', async () => {
      // Arrange
      const mockPayload = {
        lti_message_type: 'basic-lti-launch-request',
        lti_version: 'LTI-1p0',
        resource_link_id: '123',
        user_id: '456',
        roles: 'Instructor',
        context_id: '123',
        context_label: 'Test Context',
        context_title: 'Test Course',
        context_type: 'CourseSection',
        resource_link_title: 'Test Assignment',
        lis_person_name_given: 'John',
        lis_person_name_family: 'Doe',
        lis_person_name_full: 'John Doe',
        lis_person_contact_email_primary: 'test@example.com',
        launch_presentation_locale: 'en',
        ext_lms: 'test-lms',
        tool_consumer_info_product_family_code: 'Test LMS',
        tool_consumer_info_version: '1.0',
        tool_consumer_instance_guid: 'test-guid',
        tool_consumer_instance_name: 'Test Institution',
        tool_consumer_instance_description: 'Test Institution Description',
        launch_presentation_document_target: 'iframe',
        launch_presentation_return_url: 'http://example.com/return',
        oauth_callback: 'about:blank',
        ext_user_username: 'testuser',
        lis_outcome_service_url: 'http://example.com/outcomes',
        lis_result_sourcedid: JSON.stringify({
          data: {
            instanceid: 'test-instance',
            userid: 'test-user',
            typeid: null,
            launchid: 123
          },
          hash: 'test-hash'
        }),
        custom_activityname: 'test-activity'
      }

      Object.defineProperty(mockRequest, 'url', {
        value: '/test?' + new URLSearchParams(mockPayload).toString(),
        writable: true
      })

      // Act
      const result = extractBasicLtiLaunchRequest(new URLSearchParams(mockPayload))

      // Assert
      expect(result).toBeTruthy()
      expect(result).toHaveProperty('user_id', 456)
      expect(result).toHaveProperty('roles', 'Instructor')
      expect(result).toHaveProperty('lti_message_type', 'basic-lti-launch-request')
    })

    it('should handle basic LTI launch request for student', async () => {
      // Arrange
      const mockPayload: LtiBasicLaunchRequest = {
        lti_message_type: 'basic-lti-launch-request',
        lti_version: 'LTI-1p0',
        resource_link_id: 123,
        user_id: 456,
        roles: 'Learner',
        context_id: 123,
        context_label: 'Test Context',
        context_title: 'Test Course',
        context_type: 'CourseSection',
        resource_link_title: 'Test Assignment',
        lis_person_name_given: 'John',
        lis_person_name_family: 'Doe',
        lis_person_name_full: 'John Doe',
        lis_person_contact_email_primary: 'test@example.com',
        launch_presentation_locale: 'en',
        ext_lms: 'test-lms',
        tool_consumer_info_product_family_code: 'Test LMS',
        tool_consumer_info_version: '1.0',
        tool_consumer_instance_guid: 'test-guid',
        tool_consumer_instance_name: 'Test Institution',
        tool_consumer_instance_description: 'Test Institution Description',
        launch_presentation_document_target: 'iframe',
        launch_presentation_return_url: 'http://example.com/return',
        oauth_callback: 'about:blank',
        ext_user_username: 'testuser',
        lis_outcome_service_url: 'http://example.com/outcomes',
        lis_result_sourcedid: {
          data: {
            instanceid: 'test-instance',
            userid: 'test-user',
            typeid: null,
            launchid: 123
          },
          hash: 'test-hash'
        },
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
      params.append('iss', 'test-issuer')
      params.append('target_link_uri', 'test-uri')
      params.append('login_hint', 'test-hint')
      params.append('lti_message_hint', 'test-message')
      params.append('client_id', 'test-client')
      params.append('lti_deployment_id', 'test-deployment')

      // Act
      const result = extractLtiLaunchRequest(params)

      // Assert
      expect(result).toBeTruthy()
      expect(result).toEqual({
        iss: 'test-issuer',
        target_link_uri: 'test-uri',
        login_hint: 'test-hint',
        lti_message_hint: 'test-message',
        client_id: 'test-client',
        lti_deployment_id: 'test-deployment'
      })
    })

    it('should extract all provided parameters', () => {
      // Arrange
      const params = new URLSearchParams()
      params.append('iss', 'test-issuer')
      params.append('target_link_uri', 'test-uri')
      params.append('login_hint', 'test-hint')
      params.append('lti_message_hint', 'test-message')
      params.append('client_id', 'test-client')
      params.append('lti_deployment_id', 'test-deployment')
      params.append('custom_param', 'custom-value')

      // Act
      const result = extractLtiLaunchRequest(params)

      // Assert
      expect(result).toBeTruthy()
      expect(result).toEqual({
        iss: 'test-issuer',
        target_link_uri: 'test-uri',
        login_hint: 'test-hint',
        lti_message_hint: 'test-message',
        client_id: 'test-client',
        lti_deployment_id: 'test-deployment'
      })
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
      params.append('context_id', '789')
      params.append('context_label', 'TEST101')
      params.append('context_title', 'Test Course')
      params.append('context_type', 'CourseSection')
      params.append('resource_link_title', 'Test Assignment')
      params.append('custom_activityname', 'Test Activity')
      params.append('lis_person_name_given', 'John')
      params.append('lis_person_name_family', 'Doe')
      params.append('lis_person_name_full', 'John Doe')
      params.append('lis_person_contact_email_primary', 'john.doe@example.com')
      params.append('launch_presentation_locale', 'en-US')
      params.append('ext_lms', 'test-lms')
      params.append('tool_consumer_info_product_family_code', 'canvas')
      params.append('tool_consumer_info_version', '1.0')
      params.append('oauth_callback', 'about:blank')
      params.append('tool_consumer_instance_guid', 'example.com')
      params.append('tool_consumer_instance_name', 'Example University')
      params.append('tool_consumer_instance_description', 'Test Description')
      params.append('launch_presentation_document_target', 'iframe')
      params.append('launch_presentation_return_url', 'http://example.com/return')
      params.append('ext_user_username', 'jdoe')
      params.append('lis_outcome_service_url', 'https://example.com/outcomes')
      params.append(
        'lis_result_sourcedid',
        JSON.stringify({
          data: {
            instanceid: 'test-instance',
            userid: 'test-user',
            typeid: null,
            launchid: 123
          },
          hash: 'test-hash'
        })
      )

      // Act
      const result = extractBasicLtiLaunchRequest(params)

      // Assert
      expect(result).toBeTruthy()
      expect(result).toMatchObject({
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
        custom_activityname: 'Test Activity',
        lis_person_name_given: 'John',
        lis_person_name_family: 'Doe',
        lis_person_name_full: 'John Doe',
        lis_person_contact_email_primary: 'john.doe@example.com',
        launch_presentation_locale: 'en-US',
        ext_lms: 'test-lms',
        tool_consumer_info_product_family_code: 'canvas',
        tool_consumer_info_version: '1.0',
        oauth_callback: 'about:blank',
        tool_consumer_instance_guid: 'example.com',
        tool_consumer_instance_name: 'Example University',
        tool_consumer_instance_description: 'Test Description',
        launch_presentation_document_target: 'iframe',
        launch_presentation_return_url: 'http://example.com/return',
        ext_user_username: 'jdoe',
        lis_outcome_service_url: 'https://example.com/outcomes',
        lis_result_sourcedid: expect.any(Object)
      })
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
        oauth_callback: 'about:blank'
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
        oauth_callback: 'about:blank'
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
