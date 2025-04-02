import { Module } from '@nestjs/common';
import { GraphGateway } from './graph.gateway';
import { GraphService } from 'src/graph/graph.service';
import { GraphHandlerService } from './graph-handler.service';

@Module({
  providers: [GraphGateway, GraphService, GraphHandlerService],
})
export class GraphModule {}
