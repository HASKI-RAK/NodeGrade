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

  describe('handleBasicLogin', () => {
    it('should return redirect URL for student role', async () => {
      // Mock LTI basic launch request for student
      const mockPayload: Partial<LtiBasicLaunchRequest> = {
        user_id: 123,
        roles: 'Student',
        custom_activityname: 'math101',
        lis_person_contact_email_primary: 'student@example.com',
      } as LtiBasicLaunchRequest;

      const result = await service.handleBasicLogin(
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
        user_id: 456,
        roles: 'Instructor',
        custom_activityname: 'math101',
        lis_person_contact_email_primary: 'instructor@example.com',
      } as LtiBasicLaunchRequest;

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
