/* eslint-disable immutable/no-mutation */
import { AnswerInputNode } from './AnswerInputNode'
import { CleanNode } from './CleanNode'
import { ConcatObject } from './ConcatObject'
import { ConcatString } from './ConcatString'
import { CosineSimilarity } from './CosineSimilarity'
import { DocumentLoader } from './DocumentLoader'
import { ExtractNumberNode } from './ExtractNumberNode'
import { ImageNode } from './ImageNode'
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
import { KeywordCheckNode } from './KeywordCheckNode'
import { Watch } from './Watch'

export function LGraphRegisterCustomNodes() {
  // LiteGraph.clearRegisteredTypes() // Clear all registered types
  LiteGraph.registerNodeType(MyAddNode.getPath(), MyAddNode)
  LiteGraph.registerNodeType(Watch.getPath(), Watch)
  LiteGraph.registerNodeType(Textfield.getPath(), Textfield)
  LiteGraph.registerNodeType(OutputNode.getPath(), OutputNode)
  LiteGraph.registerNodeType(LLMNode.getPath(), LLMNode)
  LiteGraph.registerNodeType(AnswerInputNode.getPath(), AnswerInputNode)
  LiteGraph.registerNodeType(PromptMessage.getPath(), PromptMessage)
  LiteGraph.registerNodeType(ConcatObject.getPath(), ConcatObject)
  LiteGraph.registerNodeType(CosineSimilarity.getPath(), CosineSimilarity)
  LiteGraph.registerNodeType(SentenceTransformer.getPath(), SentenceTransformer)
  LiteGraph.registerNodeType(Precision.getPath(), Precision)
  LiteGraph.registerNodeType(ConcatString.getPath(), ConcatString)
  LiteGraph.registerNodeType(MaxInputChars.getPath(), MaxInputChars)
  LiteGraph.registerNodeType(NumberNode.getPath(), NumberNode)
  LiteGraph.registerNodeType(CleanNode.getPath(), CleanNode) // Preprocessing
  LiteGraph.registerNodeType(DocumentLoader.getPath(), DocumentLoader)
  LiteGraph.registerNodeType(QuestionNode.getPath(), QuestionNode)
  LiteGraph.registerNodeType(SampleSolutionNode.getPath(), SampleSolutionNode)
  LiteGraph.registerNodeType(ExtractNumberNode.getPath(), ExtractNumberNode)
  LiteGraph.registerNodeType(MathOperationNode.getPath(), MathOperationNode)
  LiteGraph.registerNodeType(TFIDF.getPath(), TFIDF)
  LiteGraph.registerNodeType(StringsToArray.getPath(), StringsToArray)
  LiteGraph.registerNodeType(StringArrayToString.getPath(), StringArrayToString)
  LiteGraph.registerNodeType(CountNode.getPath(), CountNode)
  LiteGraph.registerNodeType(Route.getPath(), Route)
  LiteGraph.registerNodeType(ImageNode.getPath(), ImageNode)
  LiteGraph.registerNodeType(KeywordCheckNode.getPath(), KeywordCheckNode)

  // Styling
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#272727'
  LiteGraph.NODE_DEFAULT_SHAPE = 'round'

  const graphInstance = LiteGraph // Create a new variable from LiteGraph
  return graphInstance // Return the new variable
}

export default LGraphRegisterCustomNodes
