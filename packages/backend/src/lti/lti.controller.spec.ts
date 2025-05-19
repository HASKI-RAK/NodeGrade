import { Test, TestingModule } from '@nestjs/testing';
import { LtiController } from './lti.controller';
import { LtiService } from './lti.service';
import { LtiBasicLaunchRequest } from '@haski/lti';
import { Response } from 'express';

describe('LtiController', () => {
  let controller: LtiController;
  let service: LtiService;
  let response: Partial<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LtiController],
      providers: [
        {
          provide: LtiService,
          useValue: {
            handleBasicLogin: jest.fn().mockReturnValue({
              redirectUrl: 'http://localhost:5173/ws/editor/activity',
              isEditor: true,
              timestamp: new Date().toISOString(),
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<LtiController>(LtiController);
    service = module.get<LtiService>(LtiService);
    response = {
      cookie: jest.fn(),
      redirect: jest.fn(),
    };
  });

  it('should set cookie and redirect', () => {
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
      // Required extra fields
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
    };
    const request = {} as any;
    controller.handleBasicLogin(payload, request, response as Response);
    expect(response.cookie).toHaveBeenCalledWith(
      'lti_nodegrade_cookie',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      302,
      expect.stringContaining('http://localhost:5173/ws/editor/activity'),
    );
  });
});
