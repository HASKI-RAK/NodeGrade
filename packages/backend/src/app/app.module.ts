import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { configuration } from '../config/configuration.js';
import { GraphModule } from '../graphgateway/graph.module.js';
import { ContentMigrationModule } from '../migration/content-migration.module.js';
import { PrismaModule } from '../prisma.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { RunModule } from '../run/run.module.js';
import { TemplateModule } from '../template/template.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { WorkspaceModule } from '../workspace/workspace.module.js';
import { WorkshopModule } from '../workshop/workshop.module.js';
import { BenchmarkController } from '../benchmark/benchmark.controller.js';
import { BenchmarkService } from '../benchmark/benchmark.service.js';
import { LtiController } from '../lti/lti.controller.js';
import { LtiService } from '../lti/lti.service.js';
import { XapiService } from '../xapi.service.js';
import { HealthController } from '../health/health.controller.js';
import { HealthService } from '../health/health.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    PrismaModule,
    ProviderModule,
    GraphModule,
    ContentMigrationModule,
    AdminAuthModule,
    WorkspaceModule,
    TemplateModule,
    WorkflowModule,
    WorkshopModule,
    RunModule,
  ],
  controllers: [BenchmarkController, LtiController, HealthController],
  providers: [BenchmarkService, LtiService, XapiService, HealthService],
})
export class AppModule {}
