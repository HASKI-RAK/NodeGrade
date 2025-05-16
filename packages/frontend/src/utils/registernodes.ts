import { MyAddNode } from '@haski/ta-lib'
import { LiteGraph } from 'litegraph.js'

const registerNodes = (graoh: typeof LiteGraph) => {
  graoh.registerNodeType(MyAddNode.getPath(), MyAddNode)
  //   LiteGraph.registerNodeType(Watch.getPath(), Watch)
  //   LiteGraph.registerNodeType(Textfield.getPath(), Textfield)
  //   LiteGraph.registerNodeType(OutputNode.getPath(), OutputNode)
  //   LiteGraph.registerNodeType(LLMNode.getPath(), LLMNode)
  //   LiteGraph.registerNodeType(AnswerInputNode.getPath(), AnswerInputNode)
  //   LiteGraph.registerNodeType(PromptMessage.getPath(), PromptMessage)
  //   LiteGraph.registerNodeType(ConcatObject.getPath(), ConcatObject)
  //   LiteGraph.registerNodeType(CosineSimilarity.getPath(), CosineSimilarity)
  //   LiteGraph.registerNodeType(SentenceTransformer.getPath(), SentenceTransformer)
  //   LiteGraph.registerNodeType(Precision.getPath(), Precision)
  //   LiteGraph.registerNodeType(ConcatString.getPath(), ConcatString)
  //   LiteGraph.registerNodeType(MaxInputChars.getPath(), MaxInputChars)
  //   LiteGraph.registerNodeType(NumberNode.getPath(), NumberNode)
  //   LiteGraph.registerNodeType(CleanNode.getPath(), CleanNode) // Preprocessing
  //   LiteGraph.registerNodeType(DocumentLoader.getPath(), DocumentLoader)
  //   LiteGraph.registerNodeType(QuestionNode.getPath(), QuestionNode)
  //   LiteGraph.registerNodeType(SampleSolutionNode.getPath(), SampleSolutionNode)
  //   LiteGraph.registerNodeType(ExtractNumberNode.getPath(), ExtractNumberNode)
  //   LiteGraph.registerNodeType(MathOperationNode.getPath(), MathOperationNode)
  //   LiteGraph.registerNodeType(TFIDF.getPath(), TFIDF)
  //   LiteGraph.registerNodeType(StringsToArray.getPath(), StringsToArray)
  //   LiteGraph.registerNodeType(StringArrayToString.getPath(), StringArrayToString)
  //   LiteGraph.registerNodeType(CountNode.getPath(), CountNode)
  //   LiteGraph.registerNodeType(Route.getPath(), Route)
  //   LiteGraph.registerNodeType(ImageNode.getPath(), ImageNode)
  return graoh
}
export default registerNodes
