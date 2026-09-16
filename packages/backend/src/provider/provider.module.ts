import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { ProviderController } from './provider.controller.js';
import { ModelController } from './model.controller.js';
import { ProviderCredentialCipher } from './provider-credential-cipher.js';
import { ProviderRuntimeService } from './provider-runtime.service.js';
import { ProviderService } from './provider.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [ProviderController, ModelController],
  providers: [
    ProviderCredentialCipher,
    ProviderService,
    ProviderRuntimeService,
  ],
  exports: [ProviderService, ProviderRuntimeService],
})
export class ProviderModule {}
