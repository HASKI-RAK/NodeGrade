import { Module } from '@nestjs/common';
import { JwksFetcher } from './jwks-fetcher.js';
import { LtiLaunchService } from './lti-launch.service.js';
import { LtiLoginStateStore } from './lti-login-state.store.js';
import { LtiLoginThrottle } from './lti-login-throttle.js';
import { LtiPlatformRegistry } from './lti-platform.registry.js';
import { LtiToolKeys } from './lti-tool-keys.js';
import { LtiController } from './lti.controller.js';
import { LtiService } from './lti.service.js';

/**
 * LTI 1.1 basic launches and LTI 1.3 launches (SPEC-0023). Reads Prisma through the
 * global PrismaModule; the workspace guard reads the launch cookie this module sets.
 */
@Module({
  controllers: [LtiController],
  providers: [
    LtiService,
    LtiLaunchService,
    LtiLoginStateStore,
    LtiLoginThrottle,
    JwksFetcher,
    LtiToolKeys,
    {
      provide: LtiPlatformRegistry,
      useFactory: () => LtiPlatformRegistry.fromEnvironment(),
    },
  ],
})
export class LtiModule {}
