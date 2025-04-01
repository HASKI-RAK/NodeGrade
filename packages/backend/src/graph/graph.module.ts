import { Module } from '@nestjs/common';
import { GraphGateway } from './graph.gateway';
import { GraphService } from 'src/graph.service';

@Module({
  providers: [GraphGateway, GraphService],
})
export class GraphModule {}
