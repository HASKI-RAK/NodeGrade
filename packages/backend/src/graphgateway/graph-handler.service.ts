import { Injectable, Logger } from '@nestjs/common';
import {
  ClientEventPayload,
  LGraph,
  SerializedGraph,
  AnswerInputNode,
  OutputNode,
  LGraphNode,
  LiteGraph,
  ServerEvent,
  ServerEventPayload,
} from '@haski/ta-lib';
import { GraphService } from 'src/graph/graph.service';
import { Socket } from 'socket.io';

@Injectable()
export class GraphHandlerService {
  private readonly logger = new Logger(GraphHandlerService.name);

  constructor(private readonly graphService: GraphService) {}

  /**
   * Adds execution handling to nodes in the graph
   * @param lgraph The graph to enhance
   * @param client Socket client for communication
   * @param benchmark Flag to disable reporting for benchmarking
   */
  private addOnNodeAdded(
    lgraph: LGraph,
    client: Socket,
    benchmark = false,
  ): void {
    lgraph.onNodeAdded = (node: LGraphNode) => {
      if (!benchmark && client) {
        node.emitEventCallback = (
          event: ServerEvent<keyof ServerEventPayload>,
        ) => {
          client.emit(event.eventName, event.payload);
        };
      }

      const onExecute = node.onExecute;
      node.onExecute = async function () {
        this.logger.debug(`Executing node: ${node.title}`);

        if (!benchmark && client) {
          client.emit('nodeExecuting', node.id);
        }

        node.color = LiteGraph.NODE_DEFAULT_COLOR;

        try {
          await onExecute?.call(node);

          if (!benchmark && client) {
            this.logger.debug(`Executed node: ${node.title}`);
            client.emit('nodeExecuted', node.id);
          }
        } catch (error) {
          this.logger.error(error);
          node.color = '#ff0000';

          if (!benchmark && client) {
            client.emit('nodeErrorOccured', {
              nodeId: node.id,
              error: `Error while executing node: '${node.title}' with error: ${error.message}`,
            });
          }
        }
      }.bind(this);
    };
  }

  async handleRunGraph(
    client: Socket,
    payload: ClientEventPayload['runGraph'],
  ) {
    this.logger.log(`RunGraph event received from client id: ${client.id}`);
    const lgraph = new LGraph();
    lgraph.configure(payload.graph);

    // Add the node execution handling
    this.addOnNodeAdded(lgraph, client);

    lgraph
      .findNodesByClass<AnswerInputNode>(AnswerInputNode)
      .forEach((node) => {
        node.properties.value = payload.answer.substring(0, 700);
      });

    try {
      await this.graphService.runLgraph(lgraph, (percentage) => {
        client.emit('processingPercentageUpdate', {
          eventName: 'processingPercentageUpdate',
          payload: Number(percentage.toFixed(2)) * 100,
        });
      });

      const resultNodes = lgraph.findNodesByClass<OutputNode>(OutputNode);
      const outputs = resultNodes.map((node) => node.properties);

      client.emit('graphFinished', {
        eventName: 'graphFinished',
        payload: lgraph.serialize<SerializedGraph>(),
      });
    } catch (error) {
      this.logger.error('Error running graph: ', error);
    }
  }

  async handleSaveGraph(client: any, payload: ClientEventPayload['saveGraph']) {
    this.logger.log(`SaveGraph event received from client id: ${client.id}`);
    const lgraph = new LGraph();
    lgraph.configure(payload.graph);

    const name = payload.name || 'UnnamedGraph';
    this.logger.debug(`Saving graph with name: ${name}`);

    try {
      await this.graphService.saveGraph(name, lgraph);
      client.emit('graphSaved', {
        eventName: 'graphSaved',
        payload: lgraph.serialize<SerializedGraph>(),
      });
    } catch (error) {
      this.logger.error('Error saving graph: ', error);
    }
  }
}
