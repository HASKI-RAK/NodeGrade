import { LtiService } from './lti.service';
import { LtiBasicLaunchRequest } from '@haski/lti';

describe('LtiService', () => {
  let service: LtiService;

  beforeEach(() => {
    service = new LtiService();
    process.env.FRONTEND_URL = 'http://localhost:5173';
  });

  it('should return a redirectUrl for valid payload', () => {
    const payload: LtiBasicLaunchRequest = {
      user_id: 'user1',
      roles: 'Instructor',
      resource_link_title: 'Test',
      resource_link_id: 'res1',
      tool_consumer_instance_name: 'TestInstance',
      custom_activityname: 'activity',
      tool_consumer_info_product_family_code: 'code',
      launch_presentation_locale: 'en',
      tool_consumer_instance_guid: 'guid',
      context_id: 'ctx1',
      context_title: 'Context',
      context_type: 'CourseSection',
      lis_person_name_full: 'Test User',
      lis_person_contact_email_primary: 'test@example.com',
      context_label: 'label',
      lti_message_type: 'basic-lti-launch-request',
      lis_result_sourcedid: {
        data: {
          instanceid: 'inst1',
          userid: 'user1',
          typeid: null,
          launchid: 'launch1',
        },
        hash: 'hashval',
      },
      lis_outcome_service_url: 'http://outcome.url',
      launch_presentation_document_target: 'iframe',
      launch_presentation_return_url: 'http://return.url',
      lti_version: 'LTI-1p0',
      // Add missing required fields with dummy values
      lis_person_name_given: 'Test',
      lis_person_name_family: 'User',
      ext_user_username: 'testuser',
      ext_lms: 'canvas',
      // ext_roles removed, not in type
    };
    const result = service.handleBasicLogin(payload);
    expect(result.redirectUrl).toContain(
      'http://localhost:5173/ws/editor/activity',
    );
    expect(result.isEditor).toBe(true);
    expect(typeof result.timestamp).toBe('string');
  });

  it('should throw if user_id is missing', () => {
    const payload: any = { roles: 'Instructor' };
    expect(() => service.handleBasicLogin(payload)).toThrow('Missing user_id');
  });

  it('should throw if roles is missing', () => {
    const payload: any = { user_id: 'user1' };
    expect(() => service.handleBasicLogin(payload)).toThrow('Missing roles');
  });
});
