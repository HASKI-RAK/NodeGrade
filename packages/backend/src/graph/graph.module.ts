import { Module } from '@nestjs/common';
import { GraphGateway } from './graph.gateway';

@Module({
  providers: [GraphGateway],
})
export class GraphModule {}
