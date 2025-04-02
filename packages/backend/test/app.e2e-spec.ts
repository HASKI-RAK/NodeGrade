import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { LtiBasicLaunchRequest } from '@haski/lti';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E tests for HASKI Backend
 * Testing the application as a whole, including controllers and modules
 */
describe('HASKI Backend (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  // Setup application once before all tests
  beforeAll(async () => {
    // Create proper mock for PrismaService with Jest functions
    const mockPrismaService = {
      graph: {
        findMany: jest.fn().mockImplementation(() => {
          return Promise.resolve([
            {
              id: 1,
              path: 'test-path',
              graph: { nodes: [], links: [] },
            },
          ]);
        }),
        findUnique: jest.fn().mockImplementation(() => {
          return Promise.resolve({
            id: 1,
            path: 'test-path',
            graph: { nodes: [], links: [] },
          });
        }),
      },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get the mocked PrismaService
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  // Cleanup after all tests complete
  afterAll(async () => {
    await app.close();
  });

  describe('AppController', () => {
    it('/ (GET) - should return Hello World', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(HttpStatus.OK)
        .expect('Hello World!');
    });
  });

  describe('LTI Integration', () => {
    /**
     * Helper function that provides common LTI payload structure
     * Makes tests more readable and maintainable
     */
    const createBaseLtiPayload = (
      overrides: Partial<LtiBasicLaunchRequest> = {},
    ): Partial<LtiBasicLaunchRequest> => {
      return {
        user_id: 123,
        roles: 'Student',
        context_id: 456,
        context_label: 'MATH101',
        context_title: 'Introduction to Mathematics',
        lti_message_type: 'basic-lti-launch-request',
        resource_link_title: 'Math Exercise',
        resource_link_id: 789,
        context_type: 'CourseSection',
        lis_result_sourcedid: {
          data: {
            instanceid: '123',
            userid: '456',
            typeid: null,
            launchid: 789,
          },
          hash: 'hash123',
        },
        lis_outcome_service_url: 'https://lms.example.com/outcome',
        lis_person_name_given: 'John',
        lis_person_name_family: 'Doe',
        lis_person_name_full: 'John Doe',
        ext_user_username: 'jdoe',
        lis_person_contact_email_primary: 'john.doe@example.com',
        launch_presentation_locale: 'en-US',
        ext_lms: 'moodle',
        tool_consumer_info_product_family_code: 'moodle',
        tool_consumer_info_version: '4.0',
        oauth_callback: 'about:blank',
        lti_version: 'LTI-1p0',
        tool_consumer_instance_guid: 'lms.example.com',
        tool_consumer_instance_name: 'Example University',
        tool_consumer_instance_description: 'Example University LMS',
        launch_presentation_document_target: 'iframe',
        launch_presentation_return_url: 'https://lms.example.com/return',
        custom_activityname: 'math101',
        lis_person_sourcedid: 'jdoe123',
        resource_link_description: 'Math exercise for practice',
        lis_course_section_sourcedid: 'MATH101-001',
        ...overrides,
      };
    };

    it('/lti/basiclogin (POST) - should redirect with student role', async () => {
      // Mock valid LTI basic launch request for student
      const mockPayload = createBaseLtiPayload({
        user_id: 123,
        roles: 'Student',
      });

      const response = await request(app.getHttpServer())
        .post('/lti/basiclogin')
        .send(mockPayload)
        .expect(HttpStatus.FOUND); // 302 Found (redirect)

      expect(response.header.location).toBeDefined();
      expect(response.header.location).toContain('/ws/student/math101/1/1');
      expect(response.header.location).toContain('user_id=123');
      expect(response.header.location).toContain('timestamp=');
    });

    it('/lti/basiclogin (POST) - should redirect with instructor role', async () => {
      // Mock valid LTI basic launch request for instructor
      const mockPayload = createBaseLtiPayload({
        user_id: 456,
        roles: 'Instructor',
        lis_person_name_given: 'Jane',
        lis_person_name_family: 'Smith',
        lis_person_name_full: 'Jane Smith',
        ext_user_username: 'jsmith',
        lis_person_contact_email_primary: 'jane.smith@example.com',
        lis_result_sourcedid: {
          data: {
            instanceid: '456',
            userid: '789',
            typeid: null,
            launchid: 101,
          },
          hash: 'hash456',
        },
        lis_person_sourcedid: 'jsmith456',
      });

      const response = await request(app.getHttpServer())
        .post('/lti/basiclogin')
        .send(mockPayload)
        .expect(HttpStatus.FOUND); // 302 Found (redirect)

      expect(response.header.location).toBeDefined();
      expect(response.header.location).toContain('/ws/editor/math101/1/1');
      expect(response.header.location).toContain('user_id=456');
      expect(response.header.location).toContain('timestamp=');
    });

    it('/lti/basiclogin (POST) - should handle default activity name', async () => {
      // Test when no custom_activityname is provided
      const mockPayload = createBaseLtiPayload({
        user_id: 789,
        custom_activityname: undefined,
      });

      const response = await request(app.getHttpServer())
        .post('/lti/basiclogin')
        .send(mockPayload)
        .expect(HttpStatus.FOUND);

      expect(response.header.location).toContain('/ws/student/default/1/1');
    });

    it('/lti/basiclogin (POST) - should return 400 for invalid request', async () => {
      // Invalid payload missing required fields
      const invalidPayload = {
        user_id: 789,
        roles: 'Student',
        // Missing most required fields
      };

      return request(app.getHttpServer())
        .post('/lti/basiclogin')
        .send(invalidPayload)
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          expect(res.body.message).toContain(
            'Invalid LTI Basic Launch Request',
          );
        });
    });
  });

  describe('Graph API', () => {
    it('/graphs/all (GET) - should return list of graphs', async () => {
      // Setup expectations for the graph API
      const expectedGraphs = [
        {
          id: 1,
          path: 'test-graph',
          graph: { nodes: [], links: [] },
        },
      ];

      // Update the mock implementation for this specific test
      jest
        .spyOn(prismaService.graph, 'findMany')
        .mockResolvedValueOnce(expectedGraphs as any);

      const response = await request(app.getHttpServer())
        .get('/graphs/all')
        .expect(HttpStatus.OK);

      // Test response structure
      expect(Array.isArray(response.body)).toBe(true);

      // Validate graph structure if there are any graphs returned
      if (
        response.body &&
        Array.isArray(response.body) &&
        response.body.length > 0
      ) {
        const firstGraph = response.body[0];
        expect(firstGraph.id).toBeDefined();
        expect(firstGraph.path).toBeDefined();
        expect(firstGraph.graph).toBeDefined();
      }

      // Verify that the findMany method was called
      expect(prismaService.graph.findMany).toHaveBeenCalled();
    });
  });

  describe('Benchmark API', () => {
    it('/benchmark/run (POST) - should process benchmark request', async () => {
      // Mock benchmark data
      const benchmarkData = {
        path: 'test-path',
        data: {
          question: 'What is the capital of France?',
          realAnswer: 'Paris',
          answer: 'Paris',
        },
      };

      // Setup the mock implementation for this specific test
      jest.spyOn(prismaService.graph, 'findUnique').mockResolvedValueOnce({
        id: 1,
        path: 'test-path',
        graph: { nodes: [], links: [] },
      } as any);

      // Test the benchmark endpoint
      const response = await request(app.getHttpServer())
        .post('/benchmark/run')
        .send(benchmarkData)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(prismaService.graph.findUnique).toHaveBeenCalledWith({
        where: { path: 'test-path' },
      });
    });

    it('/benchmark/run (POST) - should handle missing graph', async () => {
      const benchmarkData = {
        path: 'non-existent-path',
        data: {
          question: 'What is the capital of France?',
          realAnswer: 'Paris',
          answer: 'Paris',
        },
      };

      // Mock the findUnique to return null (graph not found)
      jest.spyOn(prismaService.graph, 'findUnique').mockResolvedValueOnce(null);

      // Should return error response
      const response = await request(app.getHttpServer())
        .post('/benchmark/run')
        .send(benchmarkData)
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      expect(response.body.message).toContain('Graph not found');
    });
  });

  // Notes for future test development:
  // WebSocket tests could be added here using socket.io-client
  // These would require a more complex setup to create WebSocket connections
  // and properly handle events and responses
});
