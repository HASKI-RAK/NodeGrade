import { Test, TestingModule } from '@nestjs/testing';
import { GraphService } from './graph.service';
import { PrismaService } from '../prisma.service';
import { LGraph } from '@haski/ta-lib';

describe('GraphService', () => {
  let service: GraphService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphService,
        {
          provide: PrismaService,
          useValue: {
            graph: {
              findMany: jest.fn(),
              findFirstOrThrow: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<GraphService>(GraphService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllGraphs', () => {
    it('should return all graphs', async () => {
      const mockGraphs = [{ id: 1, path: 'path1', graph: '{}' }];
      jest.spyOn(prisma.graph, 'findMany').mockResolvedValue(mockGraphs);

      const result = await service.findAllGraphs();
      expect(result).toEqual(mockGraphs);
      expect(prisma.graph.findMany).toHaveBeenCalled();
    });
  });

  describe('saveGraph', () => {
    it('should update an existing graph if it exists', async () => {
      const pathname = 'path1';
      const mockGraph = {
        serialize: jest.fn().mockReturnValue({}),
      } as unknown as LGraph;

      jest.spyOn(prisma.graph, 'findFirstOrThrow').mockResolvedValue({
        id: 1,
        path: pathname,
        graph: '{}',
      });
      jest.spyOn(prisma.graph, 'update').mockResolvedValue({
        id: 1,
        path: pathname,
        graph: '{}',
      });

      await service.saveGraph(pathname, mockGraph);

      expect(prisma.graph.findFirstOrThrow).toHaveBeenCalledWith({
        where: { path: pathname },
      });
      expect(prisma.graph.update).toHaveBeenCalledWith({
        where: { path: pathname },
        data: { graph: JSON.stringify(mockGraph.serialize()) },
      });
    });

    it('should create a new graph if it does not exist', async () => {
      const pathname = 'path2';
      const mockGraph = {
        serialize: jest.fn().mockReturnValue({}),
      } as unknown as LGraph;

      jest
        .spyOn(prisma.graph, 'findFirstOrThrow')
        .mockRejectedValue(new Error('Not found'));
      jest.spyOn(prisma.graph, 'create').mockResolvedValue({
        id: 2,
        path: pathname,
        graph: '{}',
      });

      await service.saveGraph(pathname, mockGraph);

      expect(prisma.graph.findFirstOrThrow).toHaveBeenCalledWith({
        where: { path: pathname },
      });
      expect(prisma.graph.create).toHaveBeenCalledWith({
        data: { path: pathname, graph: JSON.stringify(mockGraph.serialize()) },
      });
    });
  });

  describe('getGraph', () => {
    it('should return a graph by pathname', async () => {
      const pathname = 'path1';
      const mockGraph = { id: 1, path: pathname, graph: '{}' };

      jest.spyOn(prisma.graph, 'findFirst').mockResolvedValue(mockGraph);

      const result = await service.getGraph(pathname);
      expect(result).toEqual(mockGraph);
      expect(prisma.graph.findFirst).toHaveBeenCalledWith({
        where: { path: pathname },
      });
    });

    it('should return null if no graph is found', async () => {
      const pathname = 'path2';

      jest.spyOn(prisma.graph, 'findFirst').mockResolvedValue(null);

      const result = await service.getGraph(pathname);
      expect(result).toBeNull();
      expect(prisma.graph.findFirst).toHaveBeenCalledWith({
        where: { path: pathname },
      });
    });
  });
});
