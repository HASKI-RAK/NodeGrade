import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import {
  AdminWorkshopController,
  WorkshopController,
} from './workshop.controller.js';
import { WorkshopReadinessService } from './workshop-readiness.service.js';
import { WorkshopService } from './workshop.service.js';

@Module({
  imports: [AdminAuthModule, ProviderModule],
  controllers: [WorkshopController, AdminWorkshopController],
  providers: [WorkshopService, WorkshopReadinessService],
  exports: [WorkshopService, WorkshopReadinessService],
})
export class WorkshopModule {}
