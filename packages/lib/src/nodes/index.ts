/* eslint-disable immutable/no-mutation */
import { AnswerInputNode } from './AnswerInputNode'
import { CleanNode } from './CleanNode'
import { ConcatObject } from './ConcatObject'
import { ConcatString } from './ConcatString'
import { CosineSimilarity } from './CosineSimilarity'
import { DocumentLoader } from './DocumentLoader'
import { ExtractNumberNode } from './ExtractNumberNode'
import { ImageNode } from './ImageNode'
import { LGraphRegisterCustomNodes } from './LGraphRegisterCustomNodes'
import { LiteGraph } from './litegraph-extensions'
import { LLMNode } from './LLMNode'
import { MathOperationNode } from './MathOperationNode'
import { MaxInputChars } from './MaxInputChars'
import { MyAddNode } from './MyAddNode'
import { NumberNode } from './NumberNode'
import { OutputNode } from './OutputNode'
import { Precision } from './Precision'
import { PromptMessage } from './PromptMessage'
import { QuestionNode } from './QuestionNode'
import { Route } from './Route'
import { SampleSolutionNode } from './SampleSolutionNode'
import { SentenceTransformer } from './SentenceTransformer'
import { StringArrayToString } from './StringArrayToString'
import { StringsToArray } from './StringToArray'
import { Textfield } from './Textfield'
import { TFIDF } from './TF-IDF'
import { CountNode } from './utils/CountNode'
import { Watch } from './Watch'

// Reset the registered types (standard nodes)
// LiteGraph.clearRegisteredTypes()

// Register our custom nodes

LGraphRegisterCustomNodes()

export {
  AnswerInputNode,
  CleanNode,
  ConcatObject,
  ConcatString,
  CosineSimilarity,
  CountNode,
  DocumentLoader,
  LLMNode,
  MaxInputChars,
  MyAddNode,
  NumberNode,
  OutputNode,
  Precision,
  PromptMessage,
  QuestionNode,
  Route,
  SentenceTransformer,
  SampleSolutionNode,
  Textfield,
  Watch,
  LiteGraph,
  LGraphRegisterCustomNodes
}

export { LGraphNode } from './litegraph-extensions/LGraphNode'
