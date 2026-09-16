import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import {
  AdminWorkshopController,
  WorkshopController,
} from './workshop.controller.js';
import { WorkshopService } from './workshop.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [WorkshopController, AdminWorkshopController],
  providers: [WorkshopService],
  exports: [WorkshopService],
})
export class WorkshopModule {}
