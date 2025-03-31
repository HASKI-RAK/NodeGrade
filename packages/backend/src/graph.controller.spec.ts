import { Test, TestingModule } from '@nestjs/testing';
import { GraphController } from './graph.controller';
import { PrismaService } from './prisma.service';
import { HttpStatus } from '@nestjs/common';

describe('GraphController', () => {
  let graphController: GraphController;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GraphController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            graph: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    graphController = module.get<GraphController>(GraphController);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('findAllGraphs', () => {
    it('should return all graphs', async () => {
      const mockGraphs = [
        { id: 1, path: '/path1', graph: 'graph1' },
        { id: 2, path: '/path2', graph: 'graph2' },
      ];

      jest.spyOn(prismaService.graph, 'findMany').mockResolvedValue(mockGraphs);

      const responseMock = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await graphController.findAllGraphs(responseMock as any);

      expect(responseMock.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(responseMock.json).toHaveBeenCalledWith(
        mockGraphs.map((g) => ({
          id: g.id,
          path: g.path,
          graph: g.graph,
        })),
      );
    });

    it('should handle errors gracefully', async () => {
      jest
        .spyOn(prismaService.graph, 'findMany')
        .mockRejectedValue(new Error('Database error'));

      const responseMock = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await graphController.findAllGraphs(responseMock as any);

      expect(responseMock.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(responseMock.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });
  });
});
