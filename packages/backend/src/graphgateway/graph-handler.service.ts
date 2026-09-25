import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ClientEventPayload,
  LGraph,
  SerializedGraph,
  AnswerInputNode,
  isModelRef,
  LGraphNode,
  ImageNode,
  LLMNode,
  OutputNode,
  type OutputPresentation,
  QuestionNode,
} from '@haski/ta-lib';
import { Socket } from 'socket.io';
import { emitEvent } from '../../utils/socket-emitter.js';
import { buildNodeExecutionEnv } from '../config/node-env.js';
import { configuration } from '../config/configuration.js';
import { executeLgraph, GraphExecutionError } from '../core/Graph.js';
import {
  compileEditorGraphForExecution,
  SubgraphCompileError,
} from '../core/subgraph-compiler.js';
import { parseGraphContent } from '../template/template-content.js';
import {
  sanitizeExecutionError,
  sanitizeTraceOutputs,
} from '../core/trace-sanitizer.js';
import { XapiService } from '../xapi.service.js';
import { LtiCookie } from '../utils/LtiCookie.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import { ExecutionLimitsService } from '../provider/execution-limits.service.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import {
  type RecordedOutput,
  type RunOutcome,
  RunService,
} from '../run/run.service.js';

type ActiveRun = {
  runId: string;
  requestId: string;
  clientId: string;
  workspaceId: string;
  workflowId: string;
  controller: AbortController;
  /** Outputs the run emitted so far, in execution order, already sanitized. */
  outputs: RecordedOutput[];
  answer: string;
  /** Set once execution starts; a run without it leaves no record (SPEC-0020/FR-004). */
  startedAt?: Date;
  /** LTI launch display name, so the instructor's inbox tells learners apart. */
  submittedBy?: string;
};

@Injectable()
export class GraphHandlerService {
  private readonly logger = new Logger(GraphHandlerService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly executionSourceMaps = new Map<
    string,
    {
      executionId: number;
      traceLabel: string;
      wrapperId: number | null;
      sourceId: number;
      wrapperPath: string[];
    }[]
  >();

  constructor(
    private readonly workflows: WorkflowService,
    private readonly xapiService: XapiService,
    private readonly modelRuntime: ProviderRuntimeService,
    private readonly limits: ExecutionLimitsService,
    private readonly runs: RunService,
  ) {}

  /**
   * Compiles the encapsulated editor graph into an ephemeral flat execution graph.
   * The persisted workflow stays nested; only the compiled content executes.
   */
  private compileForExecution(graphContent: string): {
    content?: string;
    sourceMap?: {
      executionId: number;
      traceLabel: string;
      wrapperId: number | null;
      sourceId: number;
      wrapperPath: string[];
    }[];
    error?: { code: 'node_failed'; message: string };
  } {
    try {
      const compiled = compileEditorGraphForExecution(
        parseGraphContent(graphContent),
      );
      return {
        content: JSON.stringify(compiled.content),
        sourceMap: compiled.sourceMap,
      };
    } catch (error) {
      const message =
        error instanceof SubgraphCompileError
          ? error.message
          : 'The workflow could not be prepared for execution.';
      this.logger.warn(`Subgraph compilation failed: ${message}`);
      return { error: { code: 'node_failed', message } };
    }
  }

  /**
   * Adds execution handling to nodes in the graph
   * @param lgraph The graph to enhance
   * @param client Socket client for communication
   * @param benchmark Flag to disable reporting for benchmarking
   */
  private readonly addOnNodeAdded = (
    lgraph: LGraph,
    client: Socket,
    run: ActiveRun,
  ): void => {
    lgraph.onNodeAdded = (node: LGraphNode) => {
      this.logger.debug(
        `Node added to graph: ${node.title} (id: ${node.id}, type: ${node.type})`,
      );

      node.emitEventCallback = (event) => {
        if (event.eventName !== 'outputSet') return;
        const payload = event.payload as OutputPresentation & {
          uniqueId: string;
          type: string;
          label: string;
          value: unknown;
          verdict?: 'flagged' | 'clear';
        };
        const presentation: OutputPresentation = {
          detail: payload.detail,
          section: payload.section,
          audience: payload.audience,
          toneMap: payload.toneMap,
          statusKey: payload.statusKey,
          max: payload.max,
          passMark: payload.passMark,
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
          [],
        )[0];
        // The compiled graph renumbers nodes, so uniqueId is an execution id. Resolve
        // it to editor identity the same way traces do, so the editor can locate the
        // node that produced this output.
        const source = this.executionSourceMaps
          .get(run.runId)
          ?.find((entry) => entry.executionId === Number(node.id));
        const wrapperId = source?.wrapperId ?? null;
        const sourceId = source?.sourceId ?? null;
        // The same sanitized output the client sees is what the run record keeps.
        run.outputs.push({
          uniqueId: payload.uniqueId,
          type: payload.type,
          label: payload.label,
          value: output.value,
          verdict: payload.verdict,
          ...presentation,
          wrapperId,
          sourceId,
          truncated: output.truncated,
        });
        client.emit(event.eventName, {
          ...payload,
          value: output.value,
          wrapperId,
          sourceId,
          runId: run.runId,
          workflowId: run.workflowId,
          timestamp: new Date().toISOString(),
        });
      };

      // Hydrate node environment on load so nodes can initialize themselves
      try {
        const nodeEnv = buildNodeExecutionEnv();
        node.env = nodeEnv;
        if (node instanceof LLMNode) node.setRuntime(this.modelRuntime);

        this.logger.debug(`Set execution context for node ${node.title}`);

        // Note: We don't call init() here because onNodeAdded is synchronous
        // init() will be called in hydrateExistingNodes() after configure() completes
      } catch (e) {
        this.logger.error(
          `Node env setup error for ${node.title} (${node.type}): ${String(e)}`,
        );
      }
    };
  };

  /**
   * Caps how many runs one workspace may have in flight, so a participant leaning on the
   * Run button cannot spend the shared provider key on their own (SPEC-0012/FR-010).
   *
   * Reports the rejection and returns true rather than throwing: no run was started, so
   * the generic run-failure path would misreport it.
   */
  private async isWorkspaceSaturated(
    client: Socket,
    workspaceId: string,
    payload: ClientEventPayload['runGraph'],
  ): Promise<boolean> {
    const { workspaceConcurrentRuns } = await this.limits.get();
    const inFlight = [...this.activeRuns.values()].filter(
      (active) => active.workspaceId === workspaceId,
    ).length;
    if (inFlight < workspaceConcurrentRuns) return false;

    const runId = randomUUID();
    const timestamp = new Date().toISOString();
    const message =
      workspaceConcurrentRuns === 1
        ? 'A run is already in progress. Wait for it to finish and try again.'
        : `This workspace already has ${workspaceConcurrentRuns} runs in progress. Wait for one to finish and try again.`;
    this.logger.warn(
      `Run rejected: workspace ${workspaceId} is at its concurrency limit`,
    );
    emitEvent(client, 'runStateChanged', {
      requestId: payload.requestId,
      runId,
      workflowId: payload.workflowId,
      state: 'failed',
      timestamp,
      error: { code: 'rate_limited', message },
    });
    emitEvent(client, 'graphOperationFailed', {
      operation: 'run',
      code: 'rate-limited',
      message,
      retryable: true,
      runId,
      workflowId: payload.workflowId,
      timestamp,
    });
    return true;
  }

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
        if (node instanceof LLMNode) node.setRuntime(this.modelRuntime);

        this.logger.debug(
          `Hydrating existing node: ${node.title} (${node.type})`,
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

  /**
   * Substitutes the facilitator's deployment default into every LLM node without an
   * explicit model selection (SPEC-0016). Stored workflow content stays untouched —
   * the substitution happens on the ephemeral execution graph only — so clearing the
   * default later restores the "select a model" failure instead of leaving a stale
   * copy behind. Nodes that keep no usable default fail in `LLMNode.onExecute` with
   * the same message as before.
   */
  private readonly applyDefaultModel = async (
    lgraph: LGraph,
  ): Promise<void> => {
    const unconfigured = lgraph
      .findNodesByClass<LLMNode>(LLMNode)
      .filter(
        (node) =>
          !isModelRef(node.properties.model_ref) ||
          node.properties.needs_model_selection === true,
      );
    if (unconfigured.length === 0) return;
    const fallback = await this.modelRuntime.defaultModel();
    if (!fallback) return;
    for (const node of unconfigured) {
      node.properties.model_ref = { ...fallback };
      node.properties.model = fallback.modelId;
      node.properties.needs_model_selection = false;
    }
    this.logger.debug(
      `Applied default model ${fallback.providerKey}/${fallback.modelId} to ${unconfigured.length} node(s)`,
    );
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
      if (await this.isWorkspaceSaturated(client, workspace.id, payload))
        return;
      run = {
        runId: randomUUID(),
        requestId: payload.requestId,
        clientId: client.id,
        workspaceId: workspace.id,
        workflowId: payload.workflowId,
        controller: new AbortController(),
        outputs: [],
        answer: '',
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
      const compiled = this.compileForExecution(graphContent);
      if (compiled.error) {
        emitEvent(client, 'runStateChanged', {
          requestId: run.requestId,
          runId: run.runId,
          workflowId: run.workflowId,
          state: 'failed',
          timestamp: new Date().toISOString(),
          error: compiled.error,
        });
        emitEvent(client, 'graphOperationFailed', {
          operation: 'run',
          code: 'run-failed',
          message: compiled.error.message,
          retryable: false,
          runId: run.runId,
          workflowId: run.workflowId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const lgraph = new LGraph();

      // Add the node execution handling BEFORE configuring
      this.addOnNodeAdded(lgraph, client, run);

      this.logger.debug('Configuring graph from client payload');
      lgraph.configure(JSON.parse(compiled.content ?? '{}'));
      this.executionSourceMaps.set(run.runId, compiled.sourceMap ?? []);

      // Hydrate all nodes that were added during configure
      await this.hydrateExistingNodes(lgraph);
      await this.applyDefaultModel(lgraph);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const nodes = (lgraph as any)._nodes as LGraphNode[];
      this.logger.debug(`Graph configured with ${nodes.length} nodes`);

      // Start measuring execution time
      const startTime = Date.now();
      run.startedAt = new Date(startTime);

      for (const node of lgraph.findNodesByClass<AnswerInputNode>(
        AnswerInputNode,
      )) {
        node.properties.value = payload.answer.substring(0, 1500);
      }
      const answer = lgraph
        .findNodesByClass<AnswerInputNode>(AnswerInputNode)
        .map((node) => node.properties.value)
        .join(' ');
      run.answer = answer;

      // Extract LtiCookie data from the client's handshake (guarded for tests)
      const ltiCookie: LtiCookie | undefined = auth?.ltiCookie;
      run.submittedBy = ltiCookie?.lis_person_name_full || undefined;

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
          mapOutputs: (outputs) => sanitizeTraceOutputs(outputs, []),
          onNodeEvent: (event) => {
            const sourceMap = this.executionSourceMaps.get(run!.runId);
            const source = sourceMap?.find(
              (entry) => entry.executionId === Number(event.node.id),
            );
            emitEvent(client, 'nodeExecutionChanged', {
              runId: run!.runId,
              workflowId: run!.workflowId,
              nodeId: Number(event.node.id),
              nodeTitle: source?.traceLabel ?? event.node.title,
              nodeType: event.node.type ?? 'unknown',
              state: event.state,
              timestamp: event.timestamp,
              startedAt: event.startedAt,
              durationMs: event.durationMs,
              outputs: event.outputs,
              warnings: event.warnings,
              wrapperId: source?.wrapperId ?? null,
              sourceId: source?.sourceId ?? null,
              wrapperPath: source?.wrapperPath ?? [],
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
        .filter(
          (node) =>
            node.properties.type === 'text' ||
            node.properties.type === 'report',
        )
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

      await this.persistRun(run, 'COMPLETED');
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
      const cancelled =
        error instanceof GraphExecutionError &&
        error.traceError.code === 'cancelled';
      if (run) {
        const traceError =
          error instanceof GraphExecutionError
            ? sanitizeExecutionError(error.traceError)
            : sanitizeExecutionError({
                code: 'node_failed',
                message: 'Run failed.',
              });
        // A cancelled run is the participant's own doing and leaves no submission.
        if (!cancelled)
          await this.persistRun(run, 'FAILED', traceError.message);
        emitEvent(client, 'runStateChanged', {
          requestId: run.requestId,
          runId: run.runId,
          workflowId: run.workflowId,
          state: cancelled ? 'cancelled' : 'failed',
          timestamp: new Date().toISOString(),
          error: traceError,
        });
      }
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
      if (run) {
        this.activeRuns.delete(run.runId);
        this.executionSourceMaps.delete(run.runId);
      }
    }
  }

  /**
   * Writes the run record before the terminal event goes out, so a client that
   * refetches its submissions on `completed` finds the row (SPEC-0020/FR-004). A run
   * that never started executing leaves no record, and a failed write is logged and
   * changes nothing the participant receives (NFR-001).
   */
  private async persistRun(
    run: ActiveRun,
    outcome: RunOutcome,
    errorMessage?: string,
  ): Promise<void> {
    if (!run.startedAt) return;
    try {
      await this.runs.record({
        runId: run.runId,
        workspaceId: run.workspaceId,
        workflowId: run.workflowId,
        outcome,
        answer: run.answer,
        outputs: run.outputs,
        errorMessage,
        submittedBy: run.submittedBy,
        startedAt: run.startedAt,
        finishedAt: new Date(),
      });
    } catch (error) {
      this.logger.warn(`Run ${run.runId} was not recorded: ${String(error)}`);
    }
  }
}
