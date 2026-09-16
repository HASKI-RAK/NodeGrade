import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { ProviderController } from './provider.controller.js';
import { ProviderService } from './provider.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [ProviderController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
