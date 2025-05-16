import { Module } from '@nestjs/common';
import { GraphModule } from '../graphgateway/graph.module';
import { PrismaService } from '../prisma.service';
import { GraphController } from '../graph/graph.controller';
import { GraphService } from '../graph/graph.service';
import { BenchmarkController } from '../benchmark/benchmark.controller';
import { BenchmarkService } from '../benchmark/benchmark.service';
import { LtiController } from '../lti/lti.controller';
import { LtiService } from '../lti/lti.service';
import { XapiService } from '../xapi.service';

@Module({
  imports: [GraphModule],
  controllers: [GraphController, BenchmarkController, LtiController],
  providers: [
    GraphService,
    PrismaService,
    BenchmarkService,
    LtiService,
    XapiService,
  ],
})
export class AppModule {}
