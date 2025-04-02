import { Test, TestingModule } from '@nestjs/testing';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { Response } from 'express';
import { HttpStatus } from '@nestjs/common';

describe('GraphController', () => {
  let graphController: GraphController;
  let graphService: GraphService;

  const mockGraphService = {
    findAllGraphs: jest.fn(),
  };

  const mockResponse = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GraphController],
      providers: [{ provide: GraphService, useValue: mockGraphService }],
    }).compile();

    graphController = module.get<GraphController>(GraphController);
    graphService = module.get<GraphService>(GraphService);
  });

  it('should return all graphs with status 200', async () => {
    const mockGraphs = [
      { id: 1, path: '/path1', graph: 'graph1' },
      { id: 2, path: '/path2', graph: 'graph2' },
    ];
    mockGraphService.findAllGraphs.mockResolvedValue(mockGraphs);

    const res = mockResponse();
    await graphController.findAllGraphs(res);

    expect(graphService.findAllGraphs).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith(
      mockGraphs.map((g) => ({
        id: g.id,
        path: g.path,
        graph: g.graph,
      })),
    );
  });
});
