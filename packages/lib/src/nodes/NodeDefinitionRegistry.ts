/* eslint-disable immutable/no-mutation */
import type { LGraphNode as LiteGraphNode } from 'litegraph.js'

import { AnswerInputNode } from './AnswerInputNode'
import { CleanNode } from './CleanNode'
import { ConcatObject } from './ConcatObject'
import { ConcatString } from './ConcatString'
import { CosineSimilarity } from './CosineSimilarity'
import { DocumentLoader } from './DocumentLoader'
import { ExtractNumberNode } from './ExtractNumberNode'
import { ImageNode } from './ImageNode'
import { KeywordCheckNode } from './KeywordCheckNode'
import { LLMNode } from './LLMNode'
import { MathOperationNode } from './MathOperationNode'
import { MaxInputChars } from './MaxInputChars'
import { MyAddNode } from './MyAddNode'
import type {
  NodeCategory,
  NodeDefinition,
  NodePropertyDefinition
} from './NodeDefinition'
import {
  applyWrappedText,
  drawSingleLinePreview,
  readTextValue,
  wrappedTextMinHeight
} from './widgets/WrappedTextPreview'
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

export interface DefinedNodeConstructor {
  new (): LiteGraphNode
  getPath(): string
  title?: string
  definition: NodeDefinition
}

const text = (key: string, label: string, keyValue = false): NodePropertyDefinition => ({
  key,
  label,
  control: { type: 'text' },
  advanced: false,
  required: false,
  keyValue
})

const textarea = (
  key: string,
  label: string,
  keyValue = false
): NodePropertyDefinition => ({
  key,
  label,
  control: { type: 'textarea', rows: 5 },
  advanced: false,
  required: false,
  keyValue
})

const number = (
  key: string,
  label: string,
  advanced = false
): NodePropertyDefinition => ({
  key,
  label,
  control: { type: 'number' },
  advanced,
  required: false,
  keyValue: !advanced
})

const toggle = (key: string, label: string): NodePropertyDefinition => ({
  key,
  label,
  control: { type: 'toggle' },
  advanced: false,
  required: false
})

type Entry = {
  node: Omit<DefinedNodeConstructor, 'definition'> & { definition?: NodeDefinition }
  category: NodeCategory
  description: string
  tags?: readonly string[]
  properties?: readonly NodePropertyDefinition[]
}

const entries: readonly Entry[] = [
  {
    node: MyAddNode,
    category: 'Essential',
    description: 'Add two numbers.',
    tags: ['sum', 'math']
  },
  {
    node: Watch,
    category: 'Essential',
    description: 'Inspect a value while a workflow runs.'
  },
  {
    node: Textfield,
    category: 'Essential',
    description: 'Provide reusable text.',
    tags: ['text'],
    properties: [textarea('value', 'Text', true)]
  },
  {
    node: OutputNode,
    category: 'Assessment',
    description: 'Show workflow output to the learner.',
    properties: [
      text('label', 'Label', true),
      {
        key: 'type',
        label: 'Display',
        control: { type: 'select', options: ['text', 'success', 'warning', 'error'] },
        advanced: false,
        required: true
      }
    ]
  },
  {
    node: LLMNode,
    category: 'AI',
    description: 'Generate text with a language model.',
    tags: ['model', 'prompt'],
    properties: [
      {
        key: 'model_ref',
        label: 'Model',
        control: { type: 'model' },
        advanced: false,
        required: true,
        keyValue: true
      },
      number('max_tokens', 'Maximum tokens', true),
      {
        key: 'temperature',
        label: 'Temperature',
        control: { type: 'slider', min: 0, max: 1, step: 0.01 },
        advanced: true,
        required: false
      },
      {
        key: 'top_p',
        label: 'Top P',
        control: { type: 'slider', min: 0, max: 1, step: 0.01 },
        advanced: true,
        required: false
      },
      number('top_k', 'Top K', true),
      number('presence_penalty', 'Presence penalty', true)
    ]
  },
  {
    node: AnswerInputNode,
    category: 'Assessment',
    description: 'Receive the learner answer.',
    properties: [
      textarea('value', 'Answer', true),
      number('minChars', 'Minimum characters'),
      number('maxChars', 'Maximum characters')
    ]
  },
  {
    node: PromptMessage,
    category: 'AI',
    description: 'Create a role-based language-model prompt.',
    tags: ['prompt', 'message'],
    properties: [
      {
        key: 'value',
        label: 'Prompt',
        control: { type: 'textarea', rows: 7 },
        advanced: false,
        required: true,
        keyValue: true
      }
    ]
  },
  { node: ConcatObject, category: 'Essential', description: 'Combine object values.' },
  {
    node: CosineSimilarity,
    category: 'Validation',
    description: 'Compare vector similarity.'
  },
  {
    node: SentenceTransformer,
    category: 'AI',
    description: 'Create sentence embeddings.'
  },
  {
    node: Precision,
    category: 'Validation',
    description: 'Round a number.',
    properties: [number('precision', 'Precision')]
  },
  {
    node: ConcatString,
    category: 'Essential',
    description: 'Join two strings.',
    properties: [toggle('space', 'Space between values')]
  },
  {
    node: MaxInputChars,
    category: 'Assessment',
    description: 'Set learner answer length.',
    properties: [number('value', 'Maximum characters')]
  },
  {
    node: NumberNode,
    category: 'Essential',
    description: 'Provide a number.',
    properties: [number('value', 'Number')]
  },
  {
    node: CleanNode,
    category: 'Validation',
    description: 'Normalize text before validation.',
    properties: [
      'trim',
      'space',
      'doubleSpace',
      'dot',
      'comma',
      'lower',
      'upper',
      'stem',
      'removeEnclosingSpecialChars'
    ].map((key) => toggle(key, key.replace(/([A-Z])/g, ' $1')))
  },
  {
    node: DocumentLoader,
    category: 'Essential',
    description: 'Load a text document.',
    properties: [
      {
        key: 'value',
        label: 'Document',
        control: { type: 'file', accept: '.txt,.md,.csv,.json' },
        advanced: false,
        required: false,
        keyValue: true
      },
      text('documentName', 'File name')
    ]
  },
  {
    node: QuestionNode,
    category: 'Assessment',
    description: 'Set the learner question.',
    properties: [textarea('value', 'Question', true)]
  },
  {
    node: SampleSolutionNode,
    category: 'Assessment',
    description: 'Set the expected solution.',
    properties: [textarea('value', 'Sample solution', true)]
  },
  {
    node: ExtractNumberNode,
    category: 'Validation',
    description: 'Extract a number from text.'
  },
  {
    node: MathOperationNode,
    category: 'Validation',
    description: 'Apply a numeric operation.',
    properties: [
      {
        key: 'operation',
        label: 'Operation',
        control: { type: 'select', options: ['+', '-', '*', '/'] },
        advanced: false,
        required: true,
        keyValue: true
      }
    ]
  },
  { node: TFIDF, category: 'Validation', description: 'Calculate TF-IDF values.' },
  {
    node: StringsToArray,
    category: 'Essential',
    description: 'Convert strings into an array.'
  },
  {
    node: StringArrayToString,
    category: 'Essential',
    description: 'Join a string array.',
    properties: [text('separator', 'Separator', true)]
  },
  {
    node: CountNode,
    category: 'Validation',
    description: 'Count words, characters, or sentences.',
    properties: [
      {
        key: 'operation',
        label: 'Count',
        control: { type: 'select', options: ['words', 'characters', 'sentences'] },
        advanced: false,
        required: true,
        keyValue: true
      }
    ]
  },
  { node: Route, category: 'Essential', description: 'Route a value between branches.' },
  {
    node: ImageNode,
    category: 'Essential',
    description: 'Provide an image.',
    properties: [
      {
        key: 'imageUrl',
        label: 'Image',
        control: { type: 'file', accept: 'image/*' },
        advanced: false,
        required: false,
        keyValue: true
      }
    ]
  },
  {
    node: KeywordCheckNode,
    category: 'Validation',
    description: 'Check required keywords.',
    tags: ['semantic'],
    properties: [toggle('useSemantic', 'Use semantic similarity')]
  }
]

const definitions = entries.map(
  ({ node, category, description, tags, properties = [] }) => {
    const definition: NodeDefinition = {
      type: node.getPath(),
      title: node.title ?? node.getPath().split('/').pop() ?? node.getPath(),
      category,
      description,
      tags,
      properties
    }
    return {
      node: Object.assign(node, { definition }) as DefinedNodeConstructor,
      definition
    }
  }
)

const byType = new Map(definitions.map(({ definition }) => [definition.type, definition]))

const legacyWidgetKeys = new Map<string, readonly string[]>([
  [OutputNode.getPath(), ['label', 'type']],
  [
    LLMNode.getPath(),
    [
      'max_tokens',
      'temperature',
      'top_p',
      'top_k',
      'presence_penalty',
      'repetition_penalty',
      'repetition_penalty_range',
      'guidance_scale',
      'model'
    ]
  ],
  [PromptMessage.getPath(), []],
  [ConcatString.getPath(), ['space']],
  [
    CleanNode.getPath(),
    [
      'trim',
      'space',
      'doubleSpace',
      'dot',
      'comma',
      'lower',
      'upper',
      'stem',
      'removeEnclosingSpecialChars'
    ]
  ],
  [Precision.getPath(), ['precision']],
  [NumberNode.getPath(), ['value']],
  [MathOperationNode.getPath(), ['operation']],
  [StringArrayToString.getPath(), ['separator']],
  [CountNode.getPath(), ['operation']],
  [KeywordCheckNode.getPath(), ['useSemantic']]
])

export const getDefinedNodeConstructors = (): readonly DefinedNodeConstructor[] =>
  definitions.map(({ node }) => node)
export const getNodeDefinitions = (): readonly NodeDefinition[] =>
  definitions.map(({ definition }) => definition)
export const getNodeDefinition = (type: string): NodeDefinition | undefined =>
  byType.get(type)

export function loadLegacyWidgetProperties(
  node: LiteGraphNode,
  serialized: {
    widgets_values?: unknown[]
    properties?: Record<string, unknown>
  }
): void {
  if (!serialized.widgets_values?.length) return
  if (!node.type) return
  const definition = getNodeDefinition(node.type)
  const keys =
    legacyWidgetKeys.get(node.type) ?? definition?.properties.map(({ key }) => key) ?? []
  keys.forEach((key, index) => {
    if (
      !Object.prototype.hasOwnProperty.call(serialized.properties ?? {}, key) &&
      serialized.widgets_values?.[index] !== undefined
    ) {
      node.properties[key] = serialized.widgets_values[index]
    }
  })
  if (
    node.type === StringArrayToString.getPath() &&
    !Object.prototype.hasOwnProperty.call(serialized.properties ?? {}, 'separator')
  ) {
    const separators: Record<string, string> = {
      space: ' ',
      'new line': '\n',
      comma: ',',
      tab: '\t'
    }
    const legacySeparator = serialized.widgets_values[0]
    if (typeof legacySeparator === 'string')
      node.properties.separator = separators[legacySeparator] ?? legacySeparator
  }
  if (
    node.type === PromptMessage.getPath() &&
    !Object.prototype.hasOwnProperty.call(serialized.properties ?? {}, 'value') &&
    typeof serialized.widgets_values[0] === 'string'
  ) {
    const current = node.properties.value
    node.properties.value = {
      ...(typeof current === 'object' && current !== null ? current : {}),
      role: serialized.widgets_values[0]
    }
  }
}

/**
 * Text-like property keys that render the wrapped compact preview with
 * seamless click-to-edit. These are `Question`, `Sample solution` and
 * `Textfield` — every `Textfield` subclass stores its content in `value`,
 * plus the plain textfield itself. `Answer input` keeps its legacy slot-label
 * rendering: its `value` is runtime input, not authored text.
 */
const WRAPPED_TEXT_NODES: Readonly<Record<string, string>> = {
  [QuestionNode.getPath()]: 'value',
  [SampleSolutionNode.getPath()]: 'value',
  [Textfield.getPath()]: 'value'
}

export function compactNodeWidgets(node: LiteGraphNode): void {
  // Free-text nodes lost their canvas widget: shrinking them row-by-row
  // would clip the new wrapped preview. Only enforce the minimum footprint
  // (room for two lines); serialized sizes (e.g. bundled templates) are
  // preserved as-is so saved layouts never shrink on load.
  if (node.type && WRAPPED_TEXT_NODES[node.type]) {
    Reflect.set(node, 'widgets', [])
    Reflect.set(node, 'serialize_widgets', false)
    node.size = [
      Math.max(node.size[0], 180),
      Math.max(node.size[1], wrappedTextMinHeight(node))
    ]
    if (Reflect.get(node, '__compactDefinitionApplied')) return
    Reflect.set(node, '__compactDefinitionApplied', true)
    applyWrappedText(node, WRAPPED_TEXT_NODES[node.type])
    return
  }
  Reflect.set(node, 'widgets', [])
  Reflect.set(node, 'serialize_widgets', false)
  const portRows = Math.max(node.inputs?.length ?? 0, node.outputs?.length ?? 0)
  node.size = [Math.max(node.size[0], 180), Math.max(64, portRows * 20 + 36)]

  if (!node.type || Reflect.get(node, '__compactDefinitionApplied')) return
  const keyProperty = getNodeDefinition(node.type)?.properties.find(
    ({ keyValue }) => keyValue
  )
  if (!keyProperty) return
  const previousDraw = Reflect.get(node, 'onDrawForeground')
  Reflect.set(node, '__compactDefinitionApplied', true)
  Reflect.set(
    node,
    'onDrawForeground',
    function (this: LiteGraphNode, context: CanvasRenderingContext2D) {
      if (typeof previousDraw === 'function') Reflect.apply(previousDraw, this, [context])
      drawSingleLinePreview(this, context, readTextValue(this, keyProperty.key))
    }
  )
}
