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

// type that matches ServerEventName with payload
export type ServerEventPayload = {
  graphFinished: SerializedGraph // graph
  nodeExecuting: number // node id
  nodeExecuted: number // node id
  graphSaved: SerializedGraph // graph
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
  // saves a graph
  saveGraph: {
    graph: SerializedGraph
    name?: string // when no name is given, use the current location.pathname
  }
  loadGraph: string // loads a graph by id (unique string identifier)
  // runs a graph
  runGraph: {
    answer: string
    user_id?: string // user id from the LTI launch (LMS) //TODO schauen was passiert wenn ohne diese geschickt wird
    timestamp?: string // timestamp from the LTI launch (LMS)
    domain?: string // custom_activityname from the LTI launch (LMS settings per activity)
    graph: SerializedGraph
  }
}

export type ClientBenchmarkPostPayload = {
  path: string
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
