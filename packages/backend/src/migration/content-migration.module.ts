import { Module } from '@nestjs/common';
import { ContentMigrationService } from './content-migration.service.js';
import { ProviderModule } from '../provider/provider.module.js';

@Module({
  imports: [ProviderModule],
  providers: [ContentMigrationService],
  exports: [ContentMigrationService],
})
export class ContentMigrationModule {}
