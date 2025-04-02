import { Body, Controller, Post } from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';

@Controller('benchmark')
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Post('run')
  async runBenchmark(
    @Body()
    data: {
      path: string;
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
