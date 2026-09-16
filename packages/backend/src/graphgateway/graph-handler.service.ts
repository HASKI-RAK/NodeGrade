import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ClientEventPayload,
  LGraph,
  SerializedGraph,
  AnswerInputNode,
  LGraphNode,
  ImageNode,
  OutputNode,
  QuestionNode,
} from '@haski/ta-lib';
import { Socket } from 'socket.io';
import { emitEvent } from '../../utils/socket-emitter.js';
import { buildNodeExecutionEnv } from '../config/node-env.js';
import { configuration } from '../config/configuration.js';
import { executeLgraph, GraphExecutionError } from '../core/Graph.js';
import {
  sanitizeExecutionError,
  sanitizeTraceOutputs,
} from '../core/trace-sanitizer.js';
import { XapiService } from '../xapi.service.js';
import { LtiCookie } from '../utils/LtiCookie.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';

type ActiveRun = {
  runId: string;
  requestId: string;
  clientId: string;
  workspaceId: string;
  workflowId: string;
  controller: AbortController;
};

@Injectable()
export class GraphHandlerService {
  private readonly logger = new Logger(GraphHandlerService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(
    private readonly workflows: WorkflowService,
    private readonly xapiService: XapiService,
  ) {}

  /**
   * Adds execution handling to nodes in the graph
   * @param lgraph The graph to enhance
   * @param client Socket client for communication
   * @param benchmark Flag to disable reporting for benchmarking
   */
  private readonly addOnNodeAdded = (
    lgraph: LGraph,
    client: Socket,
    correlation: { runId: string; workflowId: string },
  ): void => {
    lgraph.onNodeAdded = (node: LGraphNode) => {
      this.logger.debug(
        `Node added to graph: ${node.title} (id: ${node.id}, type: ${node.type})`,
      );

      node.emitEventCallback = (event) => {
        if (event.eventName !== 'outputSet') return;
        const payload = event.payload as {
          uniqueId: string;
          type: string;
          label: string;
          value: unknown;
        };
        const output = sanitizeTraceOutputs(
          [
            {
              slot: 0,
              name: payload.label,
              type: payload.type,
              value: payload.value,
              truncated: false,
            },
          ],
          [
            node.env?.OPENAI_API_KEY as string | undefined,
            node.env?.BEARER_TOKEN as string | undefined,
          ],
        )[0];
        client.emit(event.eventName, {
          ...payload,
          value: output.value,
          ...correlation,
          timestamp: new Date().toISOString(),
        });
      };

      // Hydrate node environment on load so nodes can initialize themselves
      try {
        const nodeEnv = buildNodeExecutionEnv();
        node.env = nodeEnv;

        this.logger.debug(
          `Set env for node ${node.title} with MODEL_WORKER_URL: ${nodeEnv.MODEL_WORKER_URL} OPENAI: ${nodeEnv.OPENAI_API_KEY ? 'on' : 'off'}`,
        );

        // Note: We don't call init() here because onNodeAdded is synchronous
        // init() will be called in hydrateExistingNodes() after configure() completes
      } catch (e) {
        this.logger.error(
          `Node env setup error for ${node.title} (${node.type}): ${String(e)}`,
        );
      }
    };
  };

  cancelRun(client: Socket, payload: ClientEventPayload['cancelRun']): void {
    const workspace = (client.data as { workspace?: ResolvedWorkspace })
      .workspace;
    const run = this.activeRuns.get(payload.runId);
    if (
      !workspace ||
      !run ||
      run.clientId !== client.id ||
      run.workspaceId !== workspace.id ||
      run.workflowId !== payload.workflowId
    )
      return;
    run.controller.abort();
  }

  cancelRunsForClient(clientId: string): void {
    for (const run of this.activeRuns.values()) {
      if (run.clientId === clientId) run.controller.abort();
    }
  }

  private readonly sendImages = (client: Socket, lgraph: LGraph): void => {
    for (const node of lgraph.findNodesByClass(ImageNode)) {
      if (!node.properties.imageUrl) continue;
      const imageUrl = node.properties.imageUrl;
      this.logger.debug(`Sending image: ${node.title}`);
      emitEvent(client, 'questionImageSet', imageUrl);
    }
  };

  /**
   * Hydrate all existing nodes in the graph with environment variables.
   * This is called after loading a graph to ensure all nodes have access to backend resources.
   */
  private readonly hydrateExistingNodes = async (
    lgraph: LGraph,
  ): Promise<void> => {
    const nodeEnv = buildNodeExecutionEnv();

    // Access _nodes via any cast since findNodesByType doesn't support wildcard
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const nodes = (lgraph as any)._nodes as LGraphNode[];
    this.logger.debug(`Hydrating ${nodes.length} existing nodes in graph`);

    const hydrationPromises: Promise<void>[] = [];

    for (const node of nodes) {
      if (!node) continue;

      try {
        // Use any to access dynamic properties not in LGraphNode type definition
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const nodeAny = node as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        nodeAny.env = nodeEnv;

        this.logger.debug(
          `Hydrating existing node: ${node.title} (${node.type}) with MODEL_WORKER_URL: ${nodeEnv.MODEL_WORKER_URL} OPENAI: ${nodeEnv.OPENAI_API_KEY ? 'on' : 'off'}`,
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (typeof nodeAny.init === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const promise = Promise.resolve(nodeAny.init(nodeAny.env))
            .then(() => {
              this.logger.debug(
                `Existing node ${node.title} (${node.type}) successfully initialized`,
              );
            })
            .catch((e) => {
              this.logger.warn(
                `Failed to initialize existing node ${node.title} (${node.type}): ${String(e)}`,
              );
            });
          hydrationPromises.push(promise);
        }
      } catch (e) {
        this.logger.error(
          `Error hydrating existing node ${node.title} (${node.type}): ${String(e)}`,
        );
      }
    }

    // Wait for all hydrations to complete
    await Promise.all(hydrationPromises);
  };

  private readonly sendQuestion = (client: Socket, lgraph: LGraph): void => {
    for (const node of lgraph.findNodesByClass(QuestionNode)) {
      if (!node.properties.value) continue;
      const question = node.properties.value;
      this.logger.debug(`Sending question: ${node.title}`);
      emitEvent(client, 'questionSet', question);
    }
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
    let run: ActiveRun | undefined;
    try {
      const workspace = (client.data as { workspace?: ResolvedWorkspace })
        .workspace;
      if (!workspace) {
        throw new Error('A workspace-authenticated socket is required.');
      }
      run = {
        runId: randomUUID(),
        requestId: payload.requestId,
        clientId: client.id,
        workspaceId: workspace.id,
        workflowId: payload.workflowId,
        controller: new AbortController(),
      };
      this.activeRuns.set(run.runId, run);
      emitEvent(client, 'runStateChanged', {
        requestId: run.requestId,
        runId: run.runId,
        workflowId: run.workflowId,
        state: 'queued',
        timestamp: new Date().toISOString(),
      });
      const auth = (client as unknown as { handshake?: { auth?: unknown } })
        ?.handshake?.auth as { ltiCookie?: LtiCookie } | undefined;
      const persistedContent = await this.workflows.getExecutionContent(
        workspace.id,
        payload.workflowId,
        auth?.ltiCookie?.isEditor === false,
      );
      const graphContent = payload.graph ?? persistedContent;
      const lgraph = new LGraph();

      // Add the node execution handling BEFORE configuring
      this.addOnNodeAdded(lgraph, client, run);

      this.logger.debug('Configuring graph from client payload');
      lgraph.configure(JSON.parse(graphContent));

      // Hydrate all nodes that were added during configure
      await this.hydrateExistingNodes(lgraph);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const nodes = (lgraph as any)._nodes as LGraphNode[];
      this.logger.debug(`Graph configured with ${nodes.length} nodes`);

      // Start measuring execution time
      const startTime = Date.now();

      for (const node of lgraph.findNodesByClass<AnswerInputNode>(
        AnswerInputNode,
      )) {
        node.properties.value = payload.answer.substring(0, 1500);
      }
      const answer = lgraph
        .findNodesByClass<AnswerInputNode>(AnswerInputNode)
        .map((node) => node.properties.value)
        .join(' ');

      // Extract LtiCookie data from the client's handshake (guarded for tests)
      const ltiCookie: LtiCookie | undefined = auth?.ltiCookie;

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

      emitEvent(client, 'runStateChanged', {
        requestId: run.requestId,
        runId: run.runId,
        workflowId: run.workflowId,
        state: 'running',
        timestamp: new Date().toISOString(),
      });
      const nodeEnv = buildNodeExecutionEnv();
      await executeLgraph(
        lgraph,
        (percentage) => {
          emitEvent(client, 'percentageUpdated', {
            runId: run!.runId,
            workflowId: run!.workflowId,
            timestamp: new Date().toISOString(),
            percentage: Number(percentage.toFixed(2)) * 100,
          });
        },
        false,
        {
          signal: run.controller.signal,
          timeoutMs: configuration().runNodeTimeoutMs,
          mapOutputs: (outputs) =>
            sanitizeTraceOutputs(outputs, [
              nodeEnv.OPENAI_API_KEY,
              nodeEnv.BEARER_TOKEN,
            ]),
          onNodeEvent: (event) => {
            emitEvent(client, 'nodeExecutionChanged', {
              runId: run!.runId,
              workflowId: run!.workflowId,
              nodeId: Number(event.node.id),
              nodeTitle: event.node.title,
              nodeType: event.node.type ?? 'unknown',
              state: event.state,
              timestamp: event.timestamp,
              startedAt: event.startedAt,
              durationMs: event.durationMs,
              outputs: event.outputs,
              error: event.error
                ? sanitizeExecutionError(event.error)
                : undefined,
            });
          },
        },
      );

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

      emitEvent(client, 'runStateChanged', {
        requestId: run.requestId,
        runId: run.runId,
        workflowId: run.workflowId,
        state: 'completed',
        timestamp: new Date().toISOString(),
      });
      emitEvent(client, 'graphFinished', {
        runId: run.runId,
        workflowId: run.workflowId,
        timestamp: new Date().toISOString(),
        graph: JSON.stringify(lgraph.serialize<SerializedGraph>()),
      });
    } catch (error) {
      this.logger.error('Error running graph: ', error);
      if (run) {
        const traceError =
          error instanceof GraphExecutionError
            ? sanitizeExecutionError(error.traceError)
            : sanitizeExecutionError({
                code: 'node_failed',
                message: 'Run failed.',
              });
        emitEvent(client, 'runStateChanged', {
          requestId: run.requestId,
          runId: run.runId,
          workflowId: run.workflowId,
          state: traceError.code === 'cancelled' ? 'cancelled' : 'failed',
          timestamp: new Date().toISOString(),
          error: traceError,
        });
      }
      const cancelled =
        error instanceof GraphExecutionError &&
        error.traceError.code === 'cancelled';
      if (!cancelled) {
        emitEvent(client, 'graphOperationFailed', {
          operation: 'run',
          code: 'run-failed',
          message: 'The answer could not be evaluated. Please try again.',
          retryable: true,
          runId: run?.runId,
          workflowId: run?.workflowId,
          timestamp: run ? new Date().toISOString() : undefined,
        });
      }
    } finally {
      if (run) this.activeRuns.delete(run.runId);
    }
  }
}
