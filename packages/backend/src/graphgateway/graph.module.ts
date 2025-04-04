import { Module } from '@nestjs/common';
import { GraphGateway } from './graph.gateway';
import { GraphService } from '../graph/graph.service';
import { GraphHandlerService } from './graph-handler.service';
import { PrismaService } from '../prisma.service';
import { XapiService } from '../xapi.service';

@Module({
  providers: [
    GraphGateway,
    GraphService,
    GraphHandlerService,
    PrismaService,
    XapiService,
  ],
})
export class GraphModule {}
