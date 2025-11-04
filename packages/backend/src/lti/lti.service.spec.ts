import { Test, TestingModule } from '@nestjs/testing';
import { LtiService } from './lti.service';
import { LtiBasicLaunchRequest } from '@haski/lti';

describe('LtiService', () => {
  let service: LtiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LtiService],
    }).compile();

    service = module.get<LtiService>(LtiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle basic login', () => {
    const mockPayload = {
      user_id: '123',
      roles: 'Student',
      context_id: '456',
      context_label: 'Math',
      context_title: 'Math 101',
      lti_message_type: 'basic-lti-launch-request',
      lti_version: '1.3.0',
      resource_link_id: '789',
      custom_activityname: 'math101',
    } as Partial<LtiBasicLaunchRequest>;

    const result = service.handleBasicLogin(
      mockPayload as unknown as LtiBasicLaunchRequest,
    );

    expect(result).toEqual(
      expect.objectContaining({
        redirectUrl: expect.any(String),
        isEditor: expect.any(Boolean),
        timestamp: expect.any(String),
      }),
    );
  });

  describe('handleBasicLogin', () => {
    it('should return redirect URL for student role', async () => {
      // Mock LTI basic launch request for student
      const mockPayload: Partial<LtiBasicLaunchRequest> = {
        user_id: '123',
        roles: 'Student',
        custom_activityname: 'math101',
        lis_person_contact_email_primary: 'student@example.com',
      };

      const result = service.handleBasicLogin(
        mockPayload as LtiBasicLaunchRequest,
      );

      expect(result).toHaveProperty('redirectUrl');
      expect(result.redirectUrl).toContain('/ws/student/math101/1/1');
      expect(result.isEditor).toBeFalsy();
      expect(result).toHaveProperty('timestamp');
    });

    it('should return redirect URL for instructor role', async () => {
      // Mock LTI basic launch request for instructor
      const mockPayload: Partial<LtiBasicLaunchRequest> = {
        user_id: '456',
        roles: 'Instructor',
        custom_activityname: 'math101',
        lis_person_contact_email_primary: 'instructor@example.com',
      };

      const result = await service.handleBasicLogin(
        mockPayload as LtiBasicLaunchRequest,
      );

      expect(result).toHaveProperty('redirectUrl');
      expect(result.redirectUrl).toContain('/ws/editor/math101/1/1');
      expect(result.isEditor).toBeTruthy();
      expect(result).toHaveProperty('timestamp');
    });
  });
});
