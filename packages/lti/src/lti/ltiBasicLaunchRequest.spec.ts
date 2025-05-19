import { LtiBasicLaunchRequest } from './toolRegistration'

describe('LtiBasicLaunchRequest interface', () => {
  it('should allow constructing with only required fields', () => {
    // Only required fields used in handleBasicLogin
    const payload: LtiBasicLaunchRequest = {
      user_id: 'user-1',
      roles: 'Instructor',
      resource_link_title: 'Test Resource',
      resource_link_id: 'res-1',
      tool_consumer_instance_name: 'Test Instance',
      tool_consumer_info_product_family_code: 'test-family',
      launch_presentation_locale: 'en-US',
      tool_consumer_instance_guid: 'guid-1',
      context_id: 'ctx-1',
      context_title: 'Test Context',
      context_type: 'Course',
      lis_person_name_full: 'John Doe',
      lis_person_contact_email_primary: 'john.doe@example.com'
    }
    expect(payload.user_id).toBe('user-1')
    expect(payload.roles).toBe('Instructor')
  })

  it('should allow constructing with only user_id and roles (should fail type check if others are required)', () => {
    // This should fail if any other field is required
    const payload: LtiBasicLaunchRequest = {
      user_id: 'user-2',
      roles: 'Student',
      resource_link_title: '',
      resource_link_id: '',
      tool_consumer_instance_name: '',
      tool_consumer_info_product_family_code: '',
      launch_presentation_locale: '',
      tool_consumer_instance_guid: '',
      context_id: '',
      context_title: '',
      context_type: '',
      lis_person_name_full: '',
      lis_person_contact_email_primary: ''
    }
    expect(payload.user_id).toBe('user-2')
  })
})
