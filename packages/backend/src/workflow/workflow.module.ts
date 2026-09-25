import { Module } from '@nestjs/common';
import { TemplateModule } from '../template/template.module.js';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import { WorkflowHistoryController } from './workflow-history.controller.js';
import { WorkflowHistoryService } from './workflow-history.service.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';

@Module({
  imports: [WorkspaceModule, TemplateModule],
  controllers: [WorkflowController, WorkflowHistoryController],
  providers: [WorkflowService, WorkflowHistoryService],
  // The workshop module creates workflows from a pinned revision on join.
  exports: [WorkflowService],
})
export class WorkflowModule {}
