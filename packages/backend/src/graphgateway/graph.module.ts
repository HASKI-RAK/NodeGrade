import { Module } from '@nestjs/common';
import { GraphGateway } from './graph.gateway';
import { GraphService } from '../graph/graph.service';
import { GraphHandlerService } from './graph-handler.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  providers: [GraphGateway, GraphService, GraphHandlerService, PrismaService],
})
export class GraphModule {}
