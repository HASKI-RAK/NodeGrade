import { Module } from '@nestjs/common';
import { GraphGateway } from './graph.gateway.js';
import { GraphHandlerService } from './graph-handler.service.js';
import { XapiService } from '../xapi.service.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { ProviderModule } from '../provider/provider.module.js';

@Module({
  imports: [WorkflowModule, ProviderModule],
  providers: [GraphGateway, GraphHandlerService, XapiService],
})
export class GraphModule {}
