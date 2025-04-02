import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkController } from './benchmark.controller';

describe('BenchmarkController', () => {
  let controller: BenchmarkController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BenchmarkController],
    }).compile();

    controller = module.get<BenchmarkController>(BenchmarkController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
