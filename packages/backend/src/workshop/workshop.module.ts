import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import {
  AdminWorkshopController,
  WorkshopController,
  WorkshopParticipantController,
} from './workshop.controller.js';
import { WorkshopParticipantService } from './workshop-participant.service.js';
import { WorkshopReadinessService } from './workshop-readiness.service.js';
import { WorkshopService } from './workshop.service.js';

@Module({
  imports: [AdminAuthModule, ProviderModule, WorkspaceModule, WorkflowModule],
  controllers: [
    WorkshopParticipantController,
    WorkshopController,
    AdminWorkshopController,
  ],
  providers: [
    WorkshopService,
    WorkshopReadinessService,
    WorkshopParticipantService,
  ],
  exports: [WorkshopService, WorkshopReadinessService],
})
export class WorkshopModule {}
