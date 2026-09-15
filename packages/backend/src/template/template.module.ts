import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminTemplateController } from './admin-template.controller.js';
import { TemplateController } from './template.controller.js';
import { TemplateSeedService } from './template-seed.service.js';
import { TemplateService } from './template.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [TemplateController, AdminTemplateController],
  providers: [TemplateService, TemplateSeedService],
  // The workflow module instantiates from revisions; the workshop module binds to them.
  exports: [TemplateService],
})
export class TemplateModule {}
