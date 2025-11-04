import { Test, TestingModule } from '@nestjs/testing';
import { LtiController } from './lti.controller';
import { LtiService } from './lti.service';
import { LtiBasicLaunchRequest } from '@haski/lti';
import { Response, Request } from 'express';
import { BadRequestException } from '@nestjs/common';

describe('LtiController', () => {
  let controller: LtiController;
  let service: LtiService;
  let responseMock: Response;
  let requestMock: Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LtiController],
      providers: [
        {
          provide: LtiService,
          useValue: {
            handleBasicLogin: jest.fn().mockReturnValue({
              redirectUrl: 'http://example.com',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<LtiController>(LtiController);
    service = module.get<LtiService>(LtiService);
    responseMock = {
      cookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    requestMock = {} as unknown as Request;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should set cookies and redirect', () => {
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
      // extra optional fields that might be referenced in controller
      tool_consumer_instance_guid: 'tc-guid',
      tool_consumer_instance_name: 'tc-name',
      lis_person_name_full: 'John Doe',
      lis_person_contact_email_primary: 'john@example.com',
    } as Partial<LtiBasicLaunchRequest>;

    controller.handleBasicLogin(
      mockPayload as unknown as LtiBasicLaunchRequest,
      requestMock,
      responseMock,
    );

    expect(responseMock.cookie).toHaveBeenCalledWith(
      'lti_nodegrade_cookie',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: expect.any(Number) }),
    );
    expect(responseMock.redirect).toHaveBeenCalledWith(
      302,
      'http://example.com',
    );
  });

  describe('handleBasicLogin', () => {
    it('should return a redirect response with the correct URL', async () => {
      const mockPayload = {
        user_id: '123',
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

      controller.handleBasicLogin(
        mockPayload as unknown as LtiBasicLaunchRequest,
        requestMock,
        responseMock,
      );
      expect(service.handleBasicLogin).toHaveBeenCalledWith(mockPayload);
      expect(responseMock.redirect).toHaveBeenCalledWith(302, mockRedirectUrl);
    });

    it('should throw error when service fails', () => {
      const mockPayload = {
        user_id: '123',
        roles: 'Student',
      } as LtiBasicLaunchRequest;

      const testError = new Error('Test error');
      jest.spyOn(service, 'handleBasicLogin').mockImplementation(() => {
        throw testError;
      });

      expect(() =>
        controller.handleBasicLogin(
          mockPayload as unknown as LtiBasicLaunchRequest,
          requestMock,
          responseMock,
        ),
      ).toThrow('Failed to process LTI request: Test error');
      expect(service.handleBasicLogin).toHaveBeenCalledWith(
        mockPayload as unknown as LtiBasicLaunchRequest,
      );
    });
  });
});
