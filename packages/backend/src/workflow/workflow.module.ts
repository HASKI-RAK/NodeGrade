import { Module } from '@nestjs/common';
import { TemplateModule } from '../template/template.module.js';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';

@Module({
  imports: [WorkspaceModule, TemplateModule],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  // The workshop module creates workflows from a pinned revision on join.
  exports: [WorkflowService],
})
export class WorkflowModule {}
