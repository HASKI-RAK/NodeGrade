import { Test, TestingModule } from '@nestjs/testing';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { HttpStatus } from '@nestjs/common';

describe('GraphController', () => {
  let graphController: GraphController;
  let graphService: GraphService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GraphController],
      providers: [
        {
          provide: GraphService,
          useValue: {
            findAllGraphs: jest.fn(),
          },
        },
      ],
    }).compile();

    graphController = module.get<GraphController>(GraphController);
    graphService = module.get<GraphService>(GraphService);
  });

  describe('findAllGraphs', () => {
    it('should return all graphs', async () => {
      const mockGraphs = [
        { id: 1, path: '/path1', graph: 'graph1' },
        { id: 2, path: '/path2', graph: 'graph2' },
      ];

      jest.spyOn(graphService, 'findAllGraphs').mockResolvedValue(mockGraphs);

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
        .spyOn(graphService, 'findAllGraphs')
        .mockRejectedValue(new Error('Service error'));

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
