import { Injectable, Logger } from '@nestjs/common';
import {
  ClientEventPayload,
  LGraph,
  SerializedGraph,
  AnswerInputNode,
  LGraphNode,
  ImageNode,
  LiteGraph,
  ServerEvent,
  ServerEventPayload,
  OutputNode,
  QuestionNode,
} from '@haski/ta-lib';
import { Socket } from 'socket.io';
import { emitEvent } from 'utils/socket-emitter';
import { GraphService } from 'src/graph/graph.service';
import { executeLgraph } from 'src/core/Graph';
import { XapiService } from '../xapi.service';
import { LtiCookie } from '../utils/LtiCookie';

@Injectable()
export class GraphHandlerService {
  private readonly logger = new Logger(GraphHandlerService.name);

  constructor(
    private readonly graphService: GraphService,
    private readonly xapiService: XapiService,
  ) {}

  /**
   * Adds execution handling to nodes in the graph
   * @param lgraph The graph to enhance
   * @param client Socket client for communication
   * @param benchmark Flag to disable reporting for benchmarking
   */
  private addOnNodeAdded = (
    lgraph: LGraph,
    client: Socket,
    benchmark = false,
  ): void => {
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
  };

  private sendImages = (client: Socket, lgraph: LGraph): void => {
    lgraph.findNodesByClass(ImageNode).forEach((node) => {
      if (!node.properties.imageUrl) return;
      const imageUrl = node.properties.imageUrl;
      this.logger.debug(`Sending image: ${node.title}`);
      emitEvent(client, 'questionImageSet', imageUrl);
    });
  };

  private sendQuestion = (client: Socket, lgraph: LGraph): void => {
    lgraph.findNodesByClass(QuestionNode).forEach((node) => {
      if (!node.properties.value) return;
      const question = node.properties.value;
      this.logger.debug(`Sending question: ${node.title}`);
      emitEvent(client, 'questionSet', question);
    });
  };

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
    // Add the node execution handling
    this.addOnNodeAdded(lgraph, client);
    lgraph.configure(JSON.parse(payload.graph));

    // Start measuring execution time
    const startTime = Date.now();

    lgraph
      .findNodesByClass<AnswerInputNode>(AnswerInputNode)
      .forEach((node) => {
        node.properties.value = payload.answer.substring(0, 1500);
      });
    const answer = lgraph
      .findNodesByClass<AnswerInputNode>(AnswerInputNode)
      .map((node) => node.properties.value)
      .join(' ');

    try {
      // Extract LtiCookie data from the client's handshake
      const ltiCookie: LtiCookie | undefined = (
        client.handshake.auth as { ltiCookie?: LtiCookie }
      ).ltiCookie;
      try {
        // Send initial xAPI statement before executing the graph
        if (ltiCookie && payload.xapi) {
          this.logger.debug('User input xAPI statement');
          await this.xapiService.getXapi().sendStatement({
            statement: {
              actor: {
                name: ltiCookie.lis_person_name_full || 'Unknown User',
                account: {
                  name: ltiCookie.user_id || 'unknown',
                  homePage: payload.xapi?.tool_consumer_instance_guid
                    ? `https://${payload.xapi.tool_consumer_instance_guid}`
                    : 'https://example.com',
                },
              },
              verb: {
                id: 'https://wiki.haski.app/variables/nodegrade.input',
                display: {
                  en: 'input',
                },
              },
              object: {
                id: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/ws/${ltiCookie.isEditor ? 'editor' : 'student'}/${
                  payload.xapi?.custom_activityname
                }/1/1`,
                definition: {
                  name: {
                    en: payload.xapi?.resource_link_title,
                  },
                  type: 'http://www.tincanapi.co.uk/activitytypes/grade_classification',
                  description: {
                    en: 'Free form text assessment',
                  },
                },
              },
              context: {
                platform: 'nodegrade',
                language: payload.xapi?.launch_presentation_locale,
                contextActivities: {
                  parent: [
                    {
                      id: `https://${
                        payload.xapi?.tool_consumer_instance_guid
                      }/${payload.xapi?.context_id}`,
                      definition: {
                        name: {
                          en: payload.xapi?.context_title,
                        },
                        type: `https://wiki.haski.app/variables/context.${payload.xapi?.context_type}`,
                      },
                    },
                  ],
                },
              },
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        this.logger.error('Error sending xAPI statement: ', error);
      }

      await executeLgraph(lgraph, (percentage) => {
        emitEvent(
          client,
          'percentageUpdated',
          Number(percentage.toFixed(2)) * 100,
        );
      });

      // Calculate execution time in milliseconds
      const executionTimeMs = Date.now() - startTime;

      // Format duration as ISO 8601 with precision of 0.01 seconds
      // Convert ms to seconds with 2 decimal places (0.01 precision)
      const seconds = (executionTimeMs / 1000).toFixed(2);
      const formattedDuration = `PT${seconds}S`;

      this.logger.debug(`Execution time: ${formattedDuration}`);

      // Accumulate all output values from the graph where the properties.type is score
      const resultScore = lgraph
        .findNodesByClass<OutputNode>(OutputNode)
        .filter((node) => node.properties.type === 'score')
        .map((node) => node.properties.value)[0] as number;
      this.logger.debug(`Result score: ${resultScore}`);

      // Textual feedback of the first type text output:
      const feedback = lgraph
        .findNodesByClass<OutputNode>(OutputNode)
        .filter((node) => node.properties.type === 'text')
        .map((node) => node.properties.value)[0] as string;
      this.logger.debug(`Feedback: ${feedback}`);
      // Send completed xAPI statement after graph execution
      if (ltiCookie && payload.xapi) {
        this.logger.debug('Sending graph completed xAPI statement');

        await this.xapiService.getXapi().sendStatement({
          statement: {
            actor: {
              name: ltiCookie.lis_person_name_full || 'Unknown User',
              account: {
                name: ltiCookie.user_id || 'unknown',
                homePage: payload.xapi?.tool_consumer_instance_guid
                  ? `https://${payload.xapi.tool_consumer_instance_guid}`
                  : 'https://example.com',
              },
            },
            verb: {
              id: 'https://wiki.haski.app/variables/xapi.answered',
              display: {
                en: 'answered',
              },
            },
            object: {
              id: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/ws/${ltiCookie.isEditor ? 'editor' : 'student'}/${
                payload.xapi?.custom_activityname
              }/1/1`,
              definition: {
                name: {
                  en: payload.xapi?.resource_link_title,
                },
                type: 'http://www.tincanapi.co.uk/activitytypes/grade_classification',
                description: {
                  en: 'Free form text assessment',
                },
              },
            },
            result: {
              score: {
                raw: resultScore,
                min: 0,
                max: 100,
                scaled: resultScore / 100,
              },
              duration: formattedDuration,
              completion: true,
              success: resultScore >= 60,
              response: feedback,
              extensions: {
                'https://wiki.haski.app/variables/nodegrade.input': answer,
              },
            },
            context: {
              platform: 'nodegrade',
              language: payload.xapi?.launch_presentation_locale,
              contextActivities: {
                parent: [
                  {
                    id: `https://${
                      payload.xapi?.tool_consumer_instance_guid
                    }/${payload.xapi?.context_id}`,
                    definition: {
                      name: {
                        en: payload.xapi?.context_title,
                      },
                      type: `https://wiki.haski.app/variables/context.${payload.xapi?.context_type}`,
                    },
                  },
                ],
              },
            },
            timestamp: new Date().toISOString(),
          },
        });
      }

      emitEvent(
        client,
        'graphFinished',
        JSON.stringify(lgraph.serialize<SerializedGraph>()),
      );
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
    lgraph.configure(JSON.parse(payload.graph));

    const pathname = payload.name || 'UnnamedGraph';
    this.logger.debug(`Saving graph with pathname: ${pathname}`);

    try {
      await this.graphService.saveGraph(pathname, lgraph);
      emitEvent(
        client,
        'graphSaved',
        JSON.stringify(lgraph.serialize<SerializedGraph>()),
      );
    } catch (error) {
      this.logger.error('Error saving graph: ', error);
    }
  }

  async handleLoadGraph(
    client: Socket,
    payload: ClientEventPayload['loadGraph'],
  ) {
    this.logger.debug(`LoadGraph event received from client id: ${client.id}`);
    const pathname = payload || 'UnnamedGraph';
    this.logger.debug(`Loading graph with pathname: ${pathname}`);

    try {
      const graph = await this.graphService.getGraph(pathname);
      if (graph) {
        const lgraph = new LGraph();
        lgraph.configure(JSON.parse(graph.graph));
        this.addOnNodeAdded(lgraph, client);
        this.logger.debug(
          `Graph loaded successfully with pathname: ${pathname}`,
        );
        emitEvent(
          client,
          'graphLoaded',
          JSON.stringify(lgraph.serialize<SerializedGraph>()),
        );
        this.sendImages(client, lgraph);
        this.sendQuestion(client, lgraph);
        emitEvent(client, 'maxInputChars', 1500);
      } else {
        this.logger.warn(`Graph not found with pathname: ${pathname}`);
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
