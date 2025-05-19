import { Test, TestingModule } from '@nestjs/testing';
import { GraphHandlerService } from './graph-handler.service';
import { GraphService } from 'src/graph/graph.service';
import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { LGraph, AnswerInputNode, SerializedGraph } from '@haski/ta-lib';
import { emitEvent } from 'utils/socket-emitter';
import * as GraphCore from 'src/core/Graph';

jest.mock('utils/socket-emitter', () => ({
  emitEvent: jest.fn(),
}));

jest.mock('src/core/Graph', () => ({
  executeLgraph: jest.fn(),
}));

describe('GraphHandlerService', () => {
  let service: GraphHandlerService;
  let graphService: GraphService;
  const mockSocket: any = {
    handshake: {
      auth: {
        token: 'test-token',
      },
    },
    emit: jest.fn(),
    on: jest.fn(),
    id: 'mock-socket-id',
  };
  // Create a valid SerializedGraph mock object to use in tests
  const mockSerializedGraph: SerializedGraph = {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    version: 1.0,
  };

  // Load the graph from graph_simple.json
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const graphSimple = require('./graph_simple.json');
  const stringifiedGraphSimple: string = JSON.stringify(graphSimple);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphHandlerService,
        {
          provide: GraphService,
          useValue: {
            saveGraph: jest.fn(),
            getGraph: jest.fn(),
          },
        },
        {
          provide: require('../xapi.service').XapiService,
          useValue: {
            getXapi: jest.fn().mockReturnValue({ sendStatement: jest.fn() }),
          },
        },
      ],
    }).compile();

    service = module.get<GraphHandlerService>(GraphHandlerService);
    graphService = module.get<GraphService>(GraphService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleRunGraph', () => {
    it('should configure and execute the graph, emitting progress and completion events', async () => {
      const mockPayload = {
        graph: stringifiedGraphSimple,
        answer: 'testAnswer',
      };
      // Use a minimal mock node with required properties for AnswerInputNode
      const mockAnswerNode: AnswerInputNode = {
        id: 1,
        title: 'AnswerInput',
        type: 'input/answer',
        properties: { value: '' },
      } as unknown as AnswerInputNode;
      const mockLGraph = {
        configure: jest.fn(),
        findNodesByClass: jest.fn((cls) =>
          cls === AnswerInputNode ? [mockAnswerNode] : [],
        ),
        serialize: jest.fn().mockReturnValue(graphSimple),
      };
      jest.spyOn(service as any, 'addOnNodeAdded').mockImplementation();
      jest
        .spyOn(LGraph.prototype, 'configure')
        .mockImplementation(mockLGraph.configure);
      jest
        .spyOn(LGraph.prototype, 'findNodesByClass')
        .mockImplementation(mockLGraph.findNodesByClass);
      jest
        .spyOn(LGraph.prototype, 'serialize')
        .mockImplementation(mockLGraph.serialize);

      await service.handleRunGraph(mockSocket, mockPayload);

      expect(mockLGraph.configure).toHaveBeenCalledWith(
        JSON.parse(mockPayload.graph),
      );
      expect(mockLGraph.findNodesByClass).toHaveBeenCalledWith(AnswerInputNode);
      expect(mockAnswerNode.properties.value).toBe('testAnswer');

      expect(GraphCore.executeLgraph).toHaveBeenCalledTimes(1);

      expect(emitEvent).toHaveBeenCalledWith(
        mockSocket,
        'graphFinished',
        JSON.stringify(graphSimple),
      );
    });

    it('should log an error if graph execution fails', async () => {
      const mockPayload = {
        graph: stringifiedGraphSimple,
        answer: 'testAnswer',
      };
      jest
        .spyOn(GraphCore, 'executeLgraph')
        .mockRejectedValue(new Error('Execution error'));
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.handleRunGraph(mockSocket, mockPayload);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error running graph: ',
        expect.any(Error),
      );
    });
  });

  describe('handleSaveGraph', () => {
    it('should save the graph and emit a "graphSaved" event', async () => {
      const mockPayload = {
        graph: stringifiedGraphSimple,
        name: 'testGraph',
      };
      const mockLGraph = {
        configure: jest.fn(),
        serialize: jest.fn().mockReturnValue(mockSerializedGraph),
      };
      jest
        .spyOn(LGraph.prototype, 'configure')
        .mockImplementation(mockLGraph.configure);
      jest
        .spyOn(LGraph.prototype, 'serialize')
        .mockImplementation(mockLGraph.serialize);

      await service.handleSaveGraph(mockSocket, mockPayload);

      expect(mockLGraph.configure).toHaveBeenCalledWith(
        JSON.parse(mockPayload.graph),
      );
      expect(graphService.saveGraph).toHaveBeenCalledWith(
        'testGraph',
        expect.any(LGraph),
      );
      expect(emitEvent).toHaveBeenCalledWith(
        mockSocket,
        'graphSaved',
        JSON.stringify(mockSerializedGraph),
      );
    });

    it('should log an error if saving the graph fails', async () => {
      const mockPayload = {
        graph: stringifiedGraphSimple,
        name: 'testGraph',
      };
      jest
        .spyOn(graphService, 'saveGraph')
        .mockRejectedValue(new Error('Save error'));
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.handleSaveGraph(mockSocket, mockPayload);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error saving graph: ',
        expect.any(Error),
      );
    });
  });

  describe('handleLoadGraph', () => {
    it('should load the graph and emit a "graphLoaded" event', async () => {
      const mockPayload = 'testGraph';
      const mockGraphData = {
        graph: stringifiedGraphSimple,
        id: 1,
        path: 'testGraph',
      };
      const mockLGraph = {
        configure: jest.fn(),
        serialize: jest.fn().mockReturnValue(mockSerializedGraph),
      };
      jest.spyOn(graphService, 'getGraph').mockResolvedValue(mockGraphData);
      jest
        .spyOn(LGraph.prototype, 'configure')
        .mockImplementation(mockLGraph.configure);
      jest
        .spyOn(LGraph.prototype, 'serialize')
        .mockImplementation(mockLGraph.serialize);
      jest.spyOn(service as any, 'addOnNodeAdded').mockImplementation();

      await service.handleLoadGraph(mockSocket, mockPayload);

      expect(graphService.getGraph).toHaveBeenCalledWith('testGraph');
      expect(mockLGraph.configure).toHaveBeenCalledWith(
        JSON.parse(mockGraphData.graph),
      );
      expect(emitEvent).toHaveBeenCalledWith(
        mockSocket,
        'graphLoaded',
        JSON.stringify(mockSerializedGraph),
      );
    });

    it('should emit "graphNotFound" if the graph does not exist', async () => {
      const mockPayload = 'nonExistentGraph';
      jest.spyOn(graphService, 'getGraph').mockResolvedValue(null);

      await service.handleLoadGraph(mockSocket, mockPayload);

      expect(mockSocket.emit).toHaveBeenCalledWith('graphNotFound', {
        eventName: 'graphNotFound',
        payload: `Graph with pathname "nonExistentGraph" not found.`,
      });
    });

    it('should log an error if loading the graph fails', async () => {
      const mockPayload = 'testGraph';
      jest
        .spyOn(graphService, 'getGraph')
        .mockRejectedValue(new Error('Load error'));
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.handleLoadGraph(mockSocket, mockPayload);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error loading graph: ',
        expect.any(Error),
      );
    });
  });
});
