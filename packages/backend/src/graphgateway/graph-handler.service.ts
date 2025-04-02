import { Injectable, Logger } from '@nestjs/common';
import {
  ClientEventPayload,
  LGraph,
  SerializedGraph,
  AnswerInputNode,
  LGraphNode,
  LiteGraph,
  ServerEvent,
  ServerEventPayload,
} from '@haski/ta-lib';
import { Socket } from 'socket.io';
import { emitEvent } from 'utils/socket-emitter';
import { GraphService } from 'src/graph/graph.service';
import { executeLgraph } from 'src/core/Graph';

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

      const onExecute = node.onExecute?.bind(node) as typeof node.onExecute;
      node.onExecute = async () => {
        this.logger.debug(`Executing node: ${node.title}`);

        if (!benchmark && client) emitEvent(client, 'nodeExecuting', node.id);

        node.color = LiteGraph.NODE_DEFAULT_COLOR;

        try {
          await onExecute?.();

          if (!benchmark && client) {
            this.logger.debug(`Executed node: ${node.title}`);
            emitEvent(client, 'nodeExecuted', node.id);
          }
        } catch (error: unknown) {
          this.logger.error(error);
          node.color = '#ff0000';

          if (!benchmark && client) {
            emitEvent(client, 'nodeErrorOccured', {
              nodeId: node.id,
              error: `Error while executing node: '${node.title}`,
            });
          }
        }
      };
    };
  }

  /**
   * Handles the "runGraph" event from a client. Configures and executes a graph
   * based on the provided payload, updates the client with processing progress,
   * and emits the final serialized graph upon completion.
   *
   * @param client - The socket client that initiated the event.
   * @param payload - The payload containing the graph configuration and input data.
   *
   * @remarks
   * - The graph is configured using the `LGraph` class and its nodes are updated
   *   with the provided input data.
   * - Progress updates are sent to the client via the `processingPercentageUpdate` event.
   * - Upon successful execution, the serialized graph is emitted to the client
   *   through the `graphFinished` event.
   * - Errors during graph execution are logged.
   *
   * @throws Will log an error if the graph execution fails.
   */
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
      await executeLgraph(lgraph, (percentage) => {
        emitEvent(
          client,
          'percentageUpdated',
          Number(percentage.toFixed(2)) * 100,
        );
      });

      emitEvent(client, 'graphFinished', lgraph.serialize<SerializedGraph>());
    } catch (error) {
      this.logger.error('Error running graph: ', error);
    }
  }

  /**
   * Handles the "saveGraph" event from a client. This method processes the
   * incoming graph data, configures it into an LGraph instance, and saves it
   * using the graph service. Upon successful saving, it emits a "graphSaved"
   * event back to the client with the serialized graph data.
   *
   * @param client - The socket client instance that sent the event.
   * @param payload - The payload containing the graph data and optional graph name.
   *   - `payload.graph` - The graph configuration data to be saved.
   *   - `payload.name` - (Optional) The name of the graph. Defaults to "UnnamedGraph" if not provided.
   *
   * @throws Will log an error if the graph saving process fails.
   */
  async handleSaveGraph(
    client: Socket,
    payload: ClientEventPayload['saveGraph'],
  ) {
    this.logger.log(`SaveGraph event received from client id: ${client.id}`);
    const lgraph = new LGraph();
    lgraph.configure(payload.graph);

    const pathname = payload.name || 'UnnamedGraph';
    this.logger.debug(`Saving graph with pathname: ${pathname}`);

    try {
      await this.graphService.saveGraph(pathname, lgraph);
      emitEvent(client, 'graphSaved', lgraph.serialize<SerializedGraph>());
    } catch (error) {
      this.logger.error('Error saving graph: ', error);
    }
  }

  async handleLoadGraph(
    client: Socket,
    payload: ClientEventPayload['loadGraph'],
  ) {
    this.logger.log(`LoadGraph event received from client id: ${client.id}`);
    const pathname = payload || 'UnnamedGraph';
    this.logger.debug(`Loading graph with pathname: ${pathname}`);

    try {
      const graph = await this.graphService.getGraph(pathname);
      if (graph) {
        const lgraph = new LGraph();
        lgraph.configure(JSON.parse(graph.graph));
        this.addOnNodeAdded(lgraph, client);

        emitEvent(client, 'graphLoaded', lgraph.serialize<SerializedGraph>());
      } else {
        client.emit('graphNotFound', {
          eventName: 'graphNotFound',
          payload: `Graph with pathname "${pathname}" not found.`,
        });
      }
    } catch (error) {
      this.logger.error('Error loading graph: ', error);
    }
  }
}
