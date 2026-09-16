import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { ExecutionLimitsController } from './execution-limits.controller.js';
import { ExecutionLimitsService } from './execution-limits.service.js';
import { ProviderController } from './provider.controller.js';
import { ModelController } from './model.controller.js';
import { ProviderCredentialCipher } from './provider-credential-cipher.js';
import { ProviderRuntimeService } from './provider-runtime.service.js';
import { ProviderService } from './provider.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [ProviderController, ExecutionLimitsController, ModelController],
  providers: [
    ProviderCredentialCipher,
    ProviderService,
    ProviderRuntimeService,
    ExecutionLimitsService,
  ],
  exports: [ProviderService, ProviderRuntimeService, ExecutionLimitsService],
})
export class ProviderModule {}
