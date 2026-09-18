/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphCanvas } from 'litegraph.js'
import { LGraphNode, Vector2 } from './litegraph-extensions'
import { startInlineEdit, wrappedTextTop } from './widgets/WrappedTextPreview'

/**
 * Textfield - A LiteGraph node for multi-line text input and output
 *
 * This node provides a text field with inline editing capabilities that can be used
 * in node-based workflows. The canvas shows a compact wrapped preview (see
 * `compactNodeWidgets` → `applyWrappedText`); clicking the text opens an
 * inline editor styled to the same metrics so the cursor simply appears.
 * - Click the rendered text to edit inline
 * - Enter commits, Shift+Enter inserts a newline, Escape cancels
 * - String output for connecting to other nodes
 * - Persistent text storage in node properties
 *
 * Node Properties:
 * - value: The current text content (string)
 * - precision: Numeric precision setting (inherited, not used for text)
 *
 * Outputs:
 * - string: The current text value for connecting to other nodes
 */
export class Textfield extends LGraphNode {
  /**
   * Initializes a new Textfield node with default configuration
   *
   * Sets up a string output, the default text, and the initial node size.
   * Rendering and inline editing are installed by `compactNodeWidgets`
   * (wrapped preview + DOM overlay), not by a canvas widget, so compacted
   * and fresh nodes render identically.
   */
  constructor() {
    super()
    this.addOut('string')
    this.properties = { precision: 1, value: 'Enter your text' }
    this.size = [200, 100]
    this.title = 'Textfield'
  }

  /** Display name for the node type */
  static title = 'Textfield'
  /** Path identifier for node categorization */
  static path = 'basic/textfield'

  /**
   * Returns the node's categorization path
   * @returns The path string for organizing nodes in menus
   */
  static getPath(): string {
    return Textfield.path
  }

  /**
   * Executes the node's primary function - outputs the current text value
   *
   * This method is called when the node graph is executed and sends
   * the current text content to any connected nodes via the string output.
   */
  async onExecute() {
    this.setOutputData(0, this.properties.value)
  }

  /**
   * Click-to-edit fallback for nodes that never went through
   * `compactNodeWidgets`. Delegates to the wrapped-preview editor so fresh
   * nodes behave exactly like compacted ones.
   *
   * @param event - The mouse event that triggered this handler
   * @param pos - Mouse position relative to the node
   * @param graphCanvas - The graph canvas instance for coordinate calculations
   */
  onMouseDown(event: MouseEvent, pos: Vector2, graphCanvas: LGraphCanvas): void {
    // Only the text area (below the slots) starts editing; the title bar,
    // ports and resize corner keep their default drag/select behaviour.
    if (pos[1] < wrappedTextTop(this)) {
      return
    }
    startInlineEdit(this, 'value', event, pos, graphCanvas)
  }
}
