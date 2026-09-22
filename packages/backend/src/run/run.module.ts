import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import { RunController } from './run.controller.js';
import { RunService } from './run.service.js';

@Module({
  imports: [WorkspaceModule],
  controllers: [RunController],
  providers: [RunService],
  // The graph handler records a run before it emits the terminal event.
  exports: [RunService],
})
export class RunModule {}
