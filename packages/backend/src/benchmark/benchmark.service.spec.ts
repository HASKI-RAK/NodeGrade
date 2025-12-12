import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkService } from './benchmark.service';
import { PrismaService } from '../prisma.service';
import {
  LiteGraph,
  QuestionNode,
  AnswerInputNode,
  OutputNode,
  LGraphNode,
  SampleSolutionNode,
} from '@haski/ta-lib';
import { executeLgraph } from 'src/core/Graph';

jest.mock('src/core/Graph', () => ({
  executeLgraph: jest.fn(),
}));

describe('BenchmarkService', () => {
  let service: BenchmarkService;
  let prismaService: PrismaService;
  const prismaMock = {
    graph: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<BenchmarkService>(BenchmarkService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should throw an error if graph is not found', async () => {
    jest.spyOn(prismaService.graph, 'findFirst').mockResolvedValue(null);

    await expect(
      service.runBenchmark({
        path: 'non-existent-path',
        data: { question: 'Q1', realAnswer: 'A1', answer: 'A2' },
      }),
    ).rejects.toThrow('Graph not found');
  });

  it('should configure the graph and execute it', async () => {
    // Fix 1: Add missing required properties to the mock graph
    const mockGraph = {
      id: 1,
      path: 'valid-path',
      graph: JSON.stringify({ nodes: [] }),
    };

    const mockResult = {
      findNodesByClass: jest
        .fn()
        .mockReturnValue([
          { properties: { value: 'OutputValue1' } },
          { properties: { value: 'OutputValue2' } },
        ]),
    };

    jest.spyOn(prismaService.graph, 'findFirst').mockResolvedValue(mockGraph);
    jest.spyOn(LiteGraph.LGraph.prototype, 'configure').mockImplementation();

    // Fix 2: Create proper LGraphNode mock objects
    jest
      .spyOn(LiteGraph.LGraph.prototype, 'findNodesByClass')
      .mockImplementation((nodeClass) => {
        // Create a minimal implementation of LGraphNode with required properties
        const createMockNode = (props = {}): LGraphNode => {
          return {
            title: 'Mock Node',
            type: 'mock/type',
            size: [100, 100],
            graph: null,
            id: 0,
            pos: [0, 0],
            flags: {},
            inputs: [],
            outputs: [],
            properties: props,
            onExecute: async () => Promise.resolve(),
            // Add other required properties with default values
            configure: () => {},
            serialize: () => ({
              id: 0,
              type: 'mock/type',
              pos: [0, 0],
              size: [100, 100],
              flags: {},
              order: 0,
              mode: 0,
              properties: {},
              widgets_values: [],
              inputs: [],
              outputs: [],
              title: 'Mock Node',
            }),
            onAdded: () => {},
            onRemoved: () => {},
            // Add any other required methods or properties
          } as unknown as LGraphNode;
        };

        if (nodeClass === QuestionNode) {
          return [createMockNode({ question: 'Q1' })];
        } else if (nodeClass === SampleSolutionNode) {
          return [createMockNode({ realAnswer: 'A1' })];
        } else if (nodeClass === AnswerInputNode) {
          return [createMockNode({ answer: 'A2' })];
        } else if (nodeClass === OutputNode) {
          return [
            createMockNode({ value: 'OutputValue1' }),
            createMockNode({ value: 'OutputValue2' }),
          ];
        }
        return [];
      });

    (executeLgraph as jest.Mock).mockResolvedValue(mockResult);

    const result = await service.runBenchmark({
      path: 'valid-path',
      data: { question: 'Q1', realAnswer: 'A1', answer: 'A2' },
    });

    expect(prismaService.graph.findFirst).toHaveBeenCalledWith({
      where: { path: 'valid-path' },
    });
    expect(LiteGraph.LGraph.prototype.configure).toHaveBeenCalledWith(
      JSON.parse(mockGraph.graph),
    );
    expect(executeLgraph).toHaveBeenCalled();
    expect(result).toEqual(['OutputValue1', 'OutputValue2']);
  });
});
