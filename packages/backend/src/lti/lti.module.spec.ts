import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma.module.js';
import { PrismaService } from '../prisma.service.js';
import { LtiLaunchService } from './lti-launch.service.js';
import { LtiPlatformRegistry } from './lti-platform.registry.js';
import { LtiController } from './lti.controller.js';
import { LtiModule } from './lti.module.js';

describe('LtiModule', () => {
  const saved = process.env.LTI_PLATFORMS;

  afterEach(() => {
    if (saved === undefined) delete process.env.LTI_PLATFORMS;
    else process.env.LTI_PLATFORMS = saved;
  });

  // PrismaModule is global in the application; importing it here mirrors that, and the
  // override keeps the test away from a database.
  it('wires the controller, the launch service and the platform registry from the environment', async () => {
    process.env.LTI_PLATFORMS = JSON.stringify([
      {
        issuer: 'https://moodle.example.org',
        clientId: 'abc',
        deploymentIds: ['1'],
        authorizationEndpoint: 'https://moodle.example.org/mod/lti/auth.php',
        tokenEndpoint: 'https://moodle.example.org/mod/lti/token.php',
        jwksUri: 'https://moodle.example.org/mod/lti/certs.php',
      },
    ]);

    const module = await Test.createTestingModule({ imports: [PrismaModule, LtiModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(LtiController)).toBeInstanceOf(LtiController);
    expect(module.get(LtiLaunchService)).toBeInstanceOf(LtiLaunchService);
    expect(module.get(LtiPlatformRegistry).size).toBe(1);
  });

  it('refuses to start on an unreadable LTI_PLATFORMS, naming the variable', async () => {
    process.env.LTI_PLATFORMS = '[{"issuer":"https://moodle.example.org"}]';

    await expect(
      Test.createTestingModule({ imports: [PrismaModule, LtiModule] })
        .overrideProvider(PrismaService)
        .useValue({})
        .compile(),
    ).rejects.toThrow(/LTI_PLATFORMS: platform 1 needs a non-empty "clientId"/);
  });
});
