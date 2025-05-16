import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkController } from './benchmark.controller';
import { BenchmarkService } from './benchmark.service';

describe('BenchmarkController', () => {
  let benchmarkController: BenchmarkController;
  let benchmarkService: BenchmarkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BenchmarkController],
      providers: [
        {
          provide: BenchmarkService,
          useValue: {
            runBenchmark: jest.fn(),
          },
        },
      ],
    }).compile();

    benchmarkController = module.get<BenchmarkController>(BenchmarkController);
    benchmarkService = module.get<BenchmarkService>(BenchmarkService);
  });

  it('should be defined', () => {
    expect(benchmarkController).toBeDefined();
  });

  describe('runBenchmark', () => {
    it('should call BenchmarkService.runBenchmark with correct data', async () => {
      const mockData = {
        path: '/some/path',
        data: {
          question: 'What is the capital of France?',
          realAnswer: 'Paris',
          answer: 'Paris',
        },
      };

      const runBenchmarkSpy = jest
        .spyOn(benchmarkService, 'runBenchmark')
        .mockResolvedValue(['success']);

      const result = await benchmarkController.runBenchmark(mockData);

      expect(runBenchmarkSpy).toHaveBeenCalledWith(mockData);
      expect(result).toStrictEqual(['success']);
    });
  });
});
