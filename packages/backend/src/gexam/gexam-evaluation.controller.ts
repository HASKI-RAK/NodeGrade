import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { GexamEvaluationService } from './gexam-evaluation.service.js';

/** Server-to-server endpoint. No browser session or workspace token is accepted. */
@Controller('internal/evaluations')
export class GexamEvaluationController {
  constructor(private readonly evaluations: GexamEvaluationService) {}

  @Post()
  @HttpCode(202)
  async create(
    @Headers('x-internal-api-key') apiKey: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    this.evaluations.assertApiKey(apiKey);
    return this.evaluations.create(body, idempotencyKey);
  }

  @Get(':id')
  async get(
    @Headers('x-internal-api-key') apiKey: string | undefined,
    @Param('id') id: string,
  ) {
    this.evaluations.assertApiKey(apiKey);
    return this.evaluations.get(id);
  }
}
