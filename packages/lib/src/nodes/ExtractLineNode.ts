/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'

/** Line prefix the bundled classification prompts print before the category name. */
export const DEFAULT_LINE_PREFIX = 'CATEGORY:'

/**
 * Lifts one labelled line out of a structured reply.
 *
 * The bundled prompts answer in `KEY: value` lines. A `classifications` output wants
 * the bare category and nothing else, so this is the deterministic step that turns
 * "CATEGORY: MISCONCEPTION\nEVIDENCE: ..." into "MISCONCEPTION" without asking the
 * model a second time. The prefix matches case-insensitively and the first matching
 * line wins. An empty prefix selects the first non-empty line. No match yields an
 * empty string, so a downstream chip stays absent rather than showing prose.
 */
export const extractLine = (input: unknown, prefix: string): string => {
  if (input === null || input === undefined) return ''
  const lines = String(input)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const wanted = prefix.trim().toLowerCase()
  if (!wanted) return lines[0] ?? ''
  const match = lines.find((line) => line.toLowerCase().startsWith(wanted))
  return match ? match.slice(wanted.length).trim() : ''
}

/**
 * ExtractLineNode
 * Inputs: text (string)
 * Outputs: line (string) — the matching line minus its prefix
 * Properties: prefix (the `KEY:` marker to look for)
 */
export class ExtractLineNode extends LGraphNode {
  properties: {
    prefix: string
    value: string
  }
  constructor() {
    super()
    this.addIn('string', 'text')
    this.addOut('string', 'line')
    this.properties = { prefix: DEFAULT_LINE_PREFIX, value: '' }
    this.addWidget(
      'text',
      'prefix',
      this.properties.prefix,
      (v: string) => {
        this.properties.prefix = v
      },
      { placeholder: DEFAULT_LINE_PREFIX }
    )
    this.title = 'Extract Line'
    this.serialize_widgets = true
  }

  // statics
  static title = 'Extract Line'

  static path = 'text/extract-line'

  static getPath(): string {
    return ExtractLineNode.path
  }

  //name of the function to call when executing
  async onExecute() {
    this.properties.value = extractLine(this.getInputData(0), this.properties.prefix)
    this.setOutputData(0, this.properties.value)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(ExtractLineNode.path, ExtractLineNode)
  }
}
