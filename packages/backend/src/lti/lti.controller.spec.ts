import { Test, TestingModule } from '@nestjs/testing';
import { LtiController } from './lti.controller';
import { LtiService } from './lti.service';
import { LtiBasicLaunchRequest } from '@haski/lti';
import { BadRequestException } from '@nestjs/common';

describe('LtiController', () => {
  let controller: LtiController;
  let service: LtiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LtiController],
      providers: [
        {
          provide: LtiService,
          useValue: {
            handleBasicLogin: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LtiController>(LtiController);
    service = module.get<LtiService>(LtiService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleBasicLogin', () => {
    it('should return a redirect response with the correct URL', async () => {
      const mockPayload = {
        user_id: 123,
        roles: 'Student',
        custom_activityname: 'math101',
      } as LtiBasicLaunchRequest;

      const mockRedirectUrl =
        'http://localhost:5173/ws/student/math101/1/1?user_id=123&timestamp=123456';
      jest.spyOn(service, 'handleBasicLogin').mockReturnValue({
        redirectUrl: mockRedirectUrl,
        isEditor: false,
        timestamp: '123456',
      });

      const result = controller.handleBasicLogin(mockPayload);

      expect(service.handleBasicLogin).toHaveBeenCalledWith(mockPayload);
      expect(result).toEqual({
        statusCode: 302,
        url: mockRedirectUrl,
      });
    });

    it('should throw error when service fails', () => {
      const mockPayload = {
        user_id: 123,
        roles: 'Student',
      } as LtiBasicLaunchRequest;

      const testError = new Error('Test error');
      jest.spyOn(service, 'handleBasicLogin').mockImplementation(() => {
        throw testError;
      });

      expect(() => controller.handleBasicLogin(mockPayload)).toThrow(testError);
      expect(service.handleBasicLogin).toHaveBeenCalledWith(mockPayload);
    });
  });
});
