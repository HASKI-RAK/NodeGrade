import {
  serializedLGraph,
  SerializedLGraphGroup,
  SerializedLGraphNode
} from 'litegraph.js'

import { LGraphNode } from '../nodes/litegraph-extensions'
import type { ModelExecutionWarning } from '../nodes/types/ModelRef'

export type SerializedGraph = serializedLGraph<
  SerializedLGraphNode<LGraphNode>,
  [number, number, number, number, number, string],
  SerializedLGraphGroup
>

/**
 * How the preview renders an output (SPEC-0007/FR-004):
 * - `text`: prose as written.
 * - `score`: a number on a bar against `max`, with a pass chip at `passMark`.
 * - `classifications`: a list of labels as chips, coloured by the tone map.
 * - `review`: a tutor cue with a flagged/clear verdict (SPEC-0020/FR-002).
 * - `verdict`: one decision — a boolean or a token such as CORRECT — as a toned chip.
 * - `report`: `KEY: value` lines from a model reply, with a headline chip, the
 *   evidence as a quotation and the next step as a callout.
 * - `checklist`: items that are each met or not, as ticked and crossed chips.
 * - `measure`: a number on a scale that is evidence, never a grade.
 */
export type OutputType =
  | 'text'
  | 'score'
  | 'classifications'
  | 'review'
  | 'verdict'
  | 'report'
  | 'checklist'
  | 'measure'

/** Colour a card gives a verdict, headline or chip. */
export type OutputTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

/** Who a card is for: learners and educators, or educators only. */
export type OutputAudience = 'everyone' | 'educator'

/** One row of a `checklist` output. */
export type ChecklistItem = { label: string; ok: boolean }

export type OutputValue = string | number | boolean | string[] | ChecklistItem[]

/**
 * Presentation an output node attaches to its value. Everything is optional: a
 * card without it renders as it always has.
 */
export type OutputPresentation = {
  /** Secondary text under the body; wired from the node's `detail` input. */
  detail?: string
  /** Heading the results list groups the card under. */
  section?: string
  /** `educator` hides the card from the student view. */
  audience?: OutputAudience
  /** `TOKEN=tone, …` giving verdicts, headlines and chips their colour. */
  toneMap?: string
  /** `report` only: `KEY=role, …` deciding how each line is drawn. */
  roles?: string
  /** `report` only, pre-roles: the `KEY:` line that becomes the headline chip. */
  statusKey?: string
  /** `score` and `measure`: the top of the scale; unset means 100 or 1. */
  max?: number
  /** `score` only: the pass chip's threshold; zero or less means no chip. */
  passMark?: number
}

/** Verdict a `review` output carries: a human should look, or nothing was found. */
export type ReviewVerdict = 'flagged' | 'clear'

export type RunState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type NodeExecutionState =
  'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled'

export type TraceError = {
  code: 'node_failed' | 'timeout' | 'cancelled' | 'rate_limited'
  message: string
}

export type TraceOutput = {
  slot: number
  name: string
  type: string
  value: unknown
  truncated: boolean
}

export type RunCorrelation = {
  runId: string
  workflowId: string
  timestamp: string
}

export type GraphOperationFailure = {
  operation: 'load' | 'run'
  code: 'not-found' | 'load-failed' | 'run-failed' | 'rate-limited'
  message: string
  retryable: boolean
}

// type that matches ServerEventName with payload
export type ServerEventPayload = {
  runStateChanged: RunCorrelation & {
    requestId: string
    state: RunState
    error?: TraceError
  }
  nodeExecutionChanged: RunCorrelation & {
    nodeId: number
    nodeTitle: string
    nodeType: string
    state: NodeExecutionState
    startedAt?: string
    durationMs?: number
    outputs?: TraceOutput[]
    error?: TraceError
    warnings?: ModelExecutionWarning[]
    /** Editor id of the innermost block wrapper, when the node ran inside one. */
    wrapperId?: number | null
    /** Editor id of the inner node, when the node ran inside a block. */
    sourceId?: number | null
    /** Wrapper path from the outermost block, e.g. ["Feedback Generator"]. */
    wrapperPath?: string[]
  }
  graphFinished: RunCorrelation & { graph: string }
  graphOperationFailed: GraphOperationFailure & Partial<RunCorrelation>
  outputSet: RunCorrelation &
    OutputPresentation & {
    /** Id of the emitting node in the compiled execution graph. */
    uniqueId: string
    type: OutputType
    label: string
    value: OutputValue
    /** Only on `review` outputs: whether the run needs a tutor (SPEC-0020/FR-002). */
    verdict?: ReviewVerdict
    /** Editor id of the innermost block wrapper, when the node ran inside one. */
    wrapperId?: number | null
    /** Editor id of the node that produced this output; lets the editor locate it. */
    sourceId?: number | null
  }
  //feedback: string // string from the feedback node
  //successPercentage: number // can be used for cosine similarity and is indicated by a progress bar in the frontend. used by successPercentageNode
  maxInputChars: number // used by maxInputCharsNode. Can be used to limit how many characters a user can input. Default is 700
  questionSet: string // question from the question node
  questionImageSet: string // image from the question node
  percentageUpdated: RunCorrelation & { percentage: number }
}

export type ServerBenchmarkPostPayload = (string | number | string[])[]

export type ClientEventPayload = {
  runGraph: {
    requestId: string
    workflowId: string
    answer: string
    /** Unsaved editor state. The server falls back to persisted workflow content. */
    graph?: string //SerializedGraph
    xapi?: {
      // user_id is handled by cookie for security reasons
      custom_activityname: string // the name in the url to which it has been saved: for instance: strategie_leicht. This has to be specified in the LMS custom parameters
      resource_link_title: string
      tool_consumer_info_product_family_code: string
      launch_presentation_locale: string
      tool_consumer_instance_guid: string
      context_id: string
      context_title: string
      context_type: string
    }
  }
  cancelRun: {
    runId: string
    workflowId: string
  }
}

export type ClientBenchmarkPostPayload = {
  workflowId: string
  data: {
    question: string
    realAnswer: string
    answer: string
  }
}

export type ServerEvent<K extends keyof ServerEventPayload, P = ServerEventPayload[K]> = {
  eventName: K
  payload: P
}

export type ClientEvent<K extends keyof ClientEventPayload, P = ClientEventPayload[K]> = {
  eventName: K
  payload: P
}

export type ClientPayload = ClientEvent<keyof ClientEventPayload>

export type WebSocketEvent<E extends ServerEventPayload | ClientEventPayload> = {
  eventName: keyof E
  payload: E[keyof E]
}
// // test
// const event: ServerEvent<'server:ready'> = {
//   eventName: 'server:ready',
//   payload:
// }
