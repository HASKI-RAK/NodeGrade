import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('[HASKI-REQ-0030] HealthController', () => {
  let app: INestApplication;
  const prismaQueryMock = jest.fn();
  const prismaMock = {
    $queryRaw: prismaQueryMock,
  } as unknown as PrismaService;

  beforeEach(async () => {
    prismaQueryMock.mockReset();
    prismaQueryMock.mockResolvedValue([{ value: 1 }]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('[HASKI-REQ-0030] returns ok health payload when database is available', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.components.database.status).toBe('up');
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(response.body.requirements).toContain('HASKI-REQ-0030');
  });

  it('[HASKI-REQ-0030] reports degraded state when database check fails', async () => {
    prismaQueryMock.mockRejectedValueOnce(new Error('db down'));

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.components.database.status).toBe('down');
  });
});
