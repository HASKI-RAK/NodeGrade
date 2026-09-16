import { Body, Controller, Post } from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import { BenchmarkService } from './benchmark.service.js';

@Controller('benchmark')
@Facilitator()
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Post('run')
  async runBenchmark(
    @Body()
    data: {
      workflowId: string;
      data: {
        question: string;
        realAnswer: string;
        answer: string;
      };
    },
  ) {
    const result = this.benchmarkService.runBenchmark(data);
    return result;
  }
}
