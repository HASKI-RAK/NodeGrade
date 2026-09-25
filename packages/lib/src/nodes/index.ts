/* eslint-disable immutable/no-mutation */
import { AnswerInputNode } from './AnswerInputNode'
import { CleanNode } from './CleanNode'
import { ConcatObject } from './ConcatObject'
import { ConcatString } from './ConcatString'
import { CosineSimilarity } from './CosineSimilarity'
import { DocumentLoader } from './DocumentLoader'
import { ExtractLineNode } from './ExtractLineNode'
import { ExtractNumberNode } from './ExtractNumberNode'
import { ImageNode } from './ImageNode'
import { KeywordCheckNode } from './KeywordCheckNode'
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
import { ReviewFlagNode } from './ReviewFlagNode'
import { Route } from './Route'
import { SampleSolutionNode } from './SampleSolutionNode'
import { SemanticEquivalenceNode } from './SemanticEquivalenceNode'
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
  ReviewFlagNode,
  Route,
  SemanticEquivalenceNode,
  SentenceTransformer,
  SampleSolutionNode,
  Textfield,
  Watch,
  ImageNode,
  LiteGraph,
  LGraphRegisterCustomNodes,
  KeywordCheckNode,
  TFIDF,
  ExtractNumberNode,
  ExtractLineNode,
  MathOperationNode,
  StringArrayToString,
  StringsToArray
}

export {
  LGraphNode,
  CANVAS_THEME,
  CATEGORY_COLORS,
  LINK_TYPE_COLORS,
  LINK_TYPE_SHAPES,
  getPillLabel,
  getPortStyle
} from './litegraph-extensions/LGraphNode'
export {
  assertPromptContent,
  DEFAULT_PROMPT_ROLE,
  normalizePromptMessages,
  PromptMessageError
} from './promptMessages'
export {
  applyCanvasTheme,
  type CanvasThemeOptions,
  createGridPattern,
  createGridTile,
  GRID_CELL_SIZE,
  GRID_TILE_SIZE
} from './litegraph-extensions/canvasTheme'
export * from './NodeDefinition'
export {
  detectPolarity,
  extractNumbers,
  hardCheck,
  hasAmbiguousNumber,
  normalizeAnswer,
  splitIntoSpans,
  type HardCheck,
  type HardCheckOptions,
  type HardCheckReason,
  type Polarity
} from './utils/semanticEquivalence'
export {
  cosineSimilarity,
  FALLBACK_SIMILARITY_WORKER_URL,
  fetchEmbedding,
  fetchEntailment,
  fetchSimilarities,
  resolveSimilarityWorkerUrl,
  type EntailmentLabel,
  type EntailmentScores
} from './utils/similarityWorker'
export {
  DEFAULT_HIGH_THRESHOLD,
  DEFAULT_LOW_THRESHOLD,
  explainEquivalence,
  type EquivalenceReason
} from './SemanticEquivalenceNode'
export {
  DEFAULT_PASS_MARK,
  OUTPUT_AUDIENCES,
  OUTPUT_TYPES,
  type OutputNodeProperties
} from './OutputNode'
export {
  DEFAULT_TONE_MAP,
  isChecklist,
  OUTPUT_TONES,
  parseReport,
  parseToneMap,
  reportHeadline,
  toneFor,
  toneKey,
  type ParsedReport,
  type ReportEntry
} from './utils/outputPresentation'
export { DEFAULT_KEYWORD_THRESHOLD } from './KeywordCheckNode'
export {
  DEFAULT_FLAG_PATTERN,
  DEFAULT_REASON_PREFIX,
  evaluateReviewSignal,
  type ReviewSignal
} from './ReviewFlagNode'
export { DEFAULT_LINE_PREFIX, extractLine } from './ExtractLineNode'
export {
  compactNodeWidgets,
  getDefinedNodeConstructors,
  getNodeDefinition,
  getNodeDefinitions,
  loadLegacyWidgetProperties
} from './NodeDefinitionRegistry'
export {
  applyWrappedText,
  drawSingleLinePreview,
  drawWrappedText,
  fitLinesToBox,
  isInsideTextArea,
  readTextValue,
  startInlineEdit,
  wrapTextLines,
  wrappedTextMinHeight,
  wrappedTextTop,
  WRAPPED_TEXT_COLOR,
  WRAPPED_TEXT_FONT,
  WRAPPED_TEXT_FONT_SIZE,
  WRAPPED_TEXT_LINE_HEIGHT
} from './widgets/WrappedTextPreview'
