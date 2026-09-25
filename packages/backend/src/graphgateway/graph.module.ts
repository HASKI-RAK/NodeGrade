import { Module } from '@nestjs/common';
import { GraphGateway } from './graph.gateway.js';
import { GraphHandlerService } from './graph-handler.service.js';
import { XapiService } from '../xapi.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { RunModule } from '../run/run.module.js';
import { WorkspaceModule } from '../workspace/workspace.module.js';

@Module({
  imports: [WorkflowModule, ProviderModule, RunModule, WorkspaceModule],
  providers: [GraphGateway, GraphHandlerService, XapiService],
})
export class GraphModule {}
