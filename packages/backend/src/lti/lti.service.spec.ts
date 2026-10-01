import type { LtiBasicLaunchRequest } from '@haski/lti';
import type { PrismaService } from '../prisma.service.js';
import { LtiService, type LaunchInput } from './lti.service.js';

const input: LaunchInput = {
  issuer: 'https://moodle.example.org',
  contextId: 'course-1',
  contextTitle: 'Analysis I',
  resourceLinkId: 'link-1',
  resourceLinkTitle: 'Exercise 3',
  isEditor: true,
  activityName: 'default',
  userId: 'user-7',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  platformGuid: 'moodle-guid',
  platformName: 'Example University',
};

const basicLaunch = (overrides: Partial<LtiBasicLaunchRequest> = {}) =>
  ({
    user_id: '7',
    roles: 'Instructor',
    context_id: 'course-1',
    context_label: 'ANA-1',
    context_title: 'Analysis I',
    lti_message_type: 'basic-lti-launch-request',
    resource_link_title: 'Exercise 3',
    resource_link_id: 'link-1',
    context_type: 'CourseSection',
    lis_person_name_full: 'Ada Lovelace',
    lis_person_contact_email_primary: 'ada@example.test',
    tool_consumer_instance_guid: 'moodle-guid',
    tool_consumer_instance_name: 'Example University',
    lti_version: 'LTI-1p0',
    ...overrides,
  }) as LtiBasicLaunchRequest & { oauth_consumer_key?: string };

describe('LtiService', () => {
  const saved = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://grade.example.org';
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = saved;
  });

  const build = () => {
    const workspace = {
      upsert: jest.fn().mockResolvedValue({ id: 'ws-lti' }),
    };
    const workflow = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'wf-new' }),
    };
    const legacyGraph = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
    const service = new LtiService({
      workspace,
      workflow,
      legacyGraph,
    } as unknown as PrismaService);
    return { service, workspace, workflow, legacyGraph };
  };

  describe('establishLaunch', () => {
    it('keys the course workspace by issuer, context and resource link (SPEC-0004/FR-008)', async () => {
      const { service, workspace } = build();

      const launch = await service.establishLaunch(input);

      expect(launch.ltiKey).toBe('https://moodle.example.org|course-1|link-1');
      expect(workspace.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ltiKey: 'https://moodle.example.org|course-1|link-1' },
          create: { type: 'LTI', label: 'Analysis I', ltiKey: 'https://moodle.example.org|course-1|link-1' },
        }),
      );
    });

    it('sends an editor to the editor and a learner to the student view', async () => {
      const { service } = build();

      const editor = await service.establishLaunch(input);
      const student = await service.establishLaunch({ ...input, isEditor: false });

      expect(editor.redirectUrl).toBe('https://grade.example.org/editor/wf-new?lti=1');
      expect(student.redirectUrl).toBe('https://grade.example.org/student/wf-new?lti=1');
    });

    it('seeds the first workflow from the legacy graphs the activity names (ADR-0004)', async () => {
      const { service, workflow, legacyGraph } = build();
      legacyGraph.findUnique
        .mockResolvedValueOnce({ graph: '{"editor":true}' })
        .mockResolvedValueOnce({ graph: '{"student":true}' });

      await service.establishLaunch({ ...input, activityName: 'intro' });

      expect(legacyGraph.findUnique).toHaveBeenCalledWith({ where: { path: '/ws/editor/intro/1/1' } });
      expect(workflow.create.mock.calls[0][0].data).toMatchObject({
        workspaceId: 'ws-lti',
        slug: 'intro',
        name: 'Exercise 3',
        content: '{"editor":true}',
        publishedContent: '{"student":true}',
        publishedVersion: 1,
      });
    });

    it('reuses the oldest workflow of a workspace that already has one', async () => {
      const { service, workflow } = build();
      workflow.findFirst.mockResolvedValue({ id: 'wf-old' });

      const launch = await service.establishLaunch(input);

      expect(launch.workflowId).toBe('wf-old');
      expect(workflow.create).not.toHaveBeenCalled();
    });

    it('carries the person and platform into the launch cookie', async () => {
      const { service } = build();

      const { cookie } = await service.establishLaunch(input);

      expect(cookie).toMatchObject({
        user_id: 'user-7',
        isEditor: true,
        lis_person_name_full: 'Ada Lovelace',
        lis_person_contact_email_primary: 'ada@example.test',
        tool_consumer_instance_guid: 'moodle-guid',
        tool_consumer_instance_name: 'Example University',
        issuer: 'https://moodle.example.org',
        context_id: 'course-1',
        resource_link_id: 'link-1',
        ltiKey: 'https://moodle.example.org|course-1|link-1',
        workflowId: 'wf-new',
      });
    });

    it('refuses an activity name that would traverse the legacy graph path', async () => {
      const { service, workspace } = build();

      await expect(
        service.establishLaunch({ ...input, activityName: '../secret' }),
      ).rejects.toMatchObject({ status: 400, response: { code: 'lti_launch_invalid' } });
      expect(workspace.upsert).not.toHaveBeenCalled();
    });

    it('refuses to redirect to a FRONTEND_URL that is not an http(s) URL', async () => {
      const { service } = build();
      process.env.FRONTEND_URL = 'javascript:alert(1)';

      await expect(service.establishLaunch(input)).rejects.toThrow(/Invalid FRONTEND_URL/);
    });
  });

  describe('handleBasicLogin', () => {
    it('maps the 1.1 payload onto the shared launch, keyed by the consumer key', async () => {
      const { service, workspace } = build();

      const launch = await service.handleBasicLogin(
        basicLaunch({ oauth_consumer_key: 'consumer-1' } as Partial<LtiBasicLaunchRequest>),
      );

      expect(launch.ltiKey).toBe('consumer-1|course-1|link-1');
      expect(launch.redirectUrl).toBe('https://grade.example.org/editor/wf-new?lti=1');
      expect(workspace.upsert.mock.calls[0][0].create.label).toBe('Analysis I');
      expect(launch.cookie.issuer).toBe('consumer-1');
    });

    it('falls back to the platform guid when no consumer key was sent', async () => {
      const { service } = build();

      const launch = await service.handleBasicLogin(basicLaunch());

      expect(launch.ltiKey).toBe('moodle-guid|course-1|link-1');
    });

    it.each([
      ['Learner', false],
      ['urn:lti:role:ims/lis/Learner', false],
      ['Learner,Instructor', true],
      ['urn:lti:role:ims/lis/Administrator', true],
    ])('maps roles "%s" to isEditor %s', async (roles, isEditor) => {
      const { service } = build();

      const launch = await service.handleBasicLogin(basicLaunch({ roles }));

      expect(launch.isEditor).toBe(isEditor);
    });

    it('refuses a payload without user id or roles', async () => {
      const { service } = build();

      await expect(service.handleBasicLogin(basicLaunch({ user_id: '' }))).rejects.toMatchObject({
        response: { code: 'lti_launch_invalid' },
      });
      await expect(service.handleBasicLogin(basicLaunch({ roles: '' }))).rejects.toMatchObject({
        response: { code: 'lti_launch_invalid' },
      });
    });
  });
});
