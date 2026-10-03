import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { GexamEvaluationController } from './gexam-evaluation.controller.js';
import { GexamEvaluationService } from './gexam-evaluation.service.js';

@Module({
  imports: [PrismaModule, ProviderModule],
  controllers: [GexamEvaluationController],
  providers: [GexamEvaluationService],
})
export class GexamEvaluationModule {}
