import {
  serializedLGraph,
  SerializedLGraphGroup,
  SerializedLGraphNode
} from 'litegraph.js'

import { LGraphNode } from '../nodes/litegraph-extensions'

export type SerializedGraph = serializedLGraph<
  SerializedLGraphNode<LGraphNode>,
  [number, number, number, number, number, string],
  SerializedLGraphGroup
>

export type OutputType = 'text' | 'score' | 'classifications'

export type GraphOperationFailure = {
  operation: 'load' | 'run'
  code: 'not-found' | 'load-failed' | 'run-failed'
  message: string
  retryable: boolean
}

// type that matches ServerEventName with payload
export type ServerEventPayload = {
  graphFinished: string //SerializedGraph // graph run finished
  nodeExecuting: number // node id
  nodeExecuted: number // node id
  graphOperationFailed: GraphOperationFailure
  outputSet: {
    uniqueId: string
    type: OutputType
    label: string
    value: string | number | string[]
  }
  //feedback: string // string from the feedback node
  //successPercentage: number // can be used for cosine similarity and is indicated by a progress bar in the frontend. used by successPercentageNode
  maxInputChars: number // used by maxInputCharsNode. Can be used to limit how many characters a user can input. Default is 700
  nodeErrorOccured: {
    nodeId: number
    error: string
  }
  questionSet: string // question from the question node
  questionImageSet: string // image from the question node
  percentageUpdated: number // displays in the frontend as a progress bar from 0 to 100. Server calculates the percentage of the graph that has been processed
}

export type ServerBenchmarkPostPayload = (string | number | string[])[]

export type ClientEventPayload = {
  runGraph: {
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
