/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphCanvas } from 'litegraph.js'
import { LGraphNode, Vector2 } from './litegraph-extensions'
import { TextWidget } from './widgets/TextWidget'

/**
 * Textfield - A LiteGraph node for multi-line text input and output
 *
 * This node provides a text field with inline editing capabilities that can be used
 * in node-based workflows. It features:
 * - Multi-line text input with word wrapping
 * - Inline editing via click-to-edit functionality
 * - String output for connecting to other nodes
 * - Persistent text storage in node properties
 *
 * Node Properties:
 * - value: The current text content (string)
 * - precision: Numeric precision setting (inherited, not used for text)
 *
 * Outputs:
 * - string: The current text value for connecting to other nodes
 *
 * Usage:
 * 1. Add the node to your graph
 * 2. Click on the text area to start editing
 * 3. Use Shift+Enter for new lines, Enter to save
 * 4. Connect the output to other nodes that accept string input
 */
export class Textfield extends LGraphNode {
  /**
   * Initializes a new Textfield node with default configuration
   *
   * Sets up:
   * - String output connection point
   * - Default properties with placeholder text
   * - TextWidget instance for rendering and editing
   * - Initial node size and appearance
   */
  constructor() {
    super()
    this.addOut('string')
    this.properties = { precision: 1, value: 'Enter your text' }
    this.addCustomWidget<TextWidget>(new TextWidget())
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
   * Handles mouse down events for inline text editing functionality
   *
   * This method implements click-to-edit behavior by:
   * 1. Detecting clicks in the editable text area (below the title bar)
   * 2. Creating a positioned HTML textarea overlay for editing
   * 3. Calculating proper screen coordinates accounting for canvas zoom/pan
   * 4. Setting up keyboard shortcuts and event handlers
   * 5. Managing the editing lifecycle (start, save, cancel)
   *
   * Editing Features:
   * - Multi-line text input with textarea element
   * - Transparent background to blend with canvas
   * - Proper positioning that follows canvas transformations
   * - Enter to save, Shift+Enter for new lines, Escape to cancel
   * - Automatic focus and canvas redraw coordination
   *
   * @param event - The mouse event that triggered this handler
   * @param pos - Mouse position relative to the node
   * @param graphCanvas - The graph canvas instance for coordinate calculations
   */
  onMouseDown(event: MouseEvent, pos: Vector2, graphCanvas: LGraphCanvas): void {
    // only when y greater than the title margin
    if (pos[1] < 10) {
      return
    }
    event.preventDefault()

    // Calculate screen coordinates for inline input
    const canvas = graphCanvas.canvas
    const rect = canvas.getBoundingClientRect()
    const transform = graphCanvas.ds

    // Convert node position to screen coordinates
    const screenX =
      rect.left + window.scrollX + this.pos[0] * transform.scale + transform.offset[0]
    const screenY =
      rect.top +
      window.scrollY +
      (this.pos[1] + 30) * transform.scale +
      transform.offset[1]

    // Prevent duplicate input
    if (document.getElementById('inlineTextInput')) {
      return
    }

    const oldInput = this.properties.value

    // Create input element
    const input = document.createElement('textarea')
    input.id = 'inlineTextInput'
    input.value = this.properties.value
    input.style.position = 'absolute'
    input.style.left = `${screenX}px`
    input.style.top = `${screenY}px`
    input.style.width = `${(this.size[0] - 20) * transform.scale}px`
    input.style.height = `${(this.size[1] - 40) * transform.scale}px`
    input.style.zIndex = '1000'
    input.style.fontSize = '16px'
    input.style.border = 'none' // No border
    input.style.padding = '2px'
    input.style.margin = '0px'
    input.style.outline = 'none'
    input.style.font = '16px Arial'
    input.style.color = 'white'
    //transparent:
    input.style.backgroundColor = 'rgba(0, 0, 0, 0)' // Semi-transparent background
    input.style.borderRadius = '2px'
    input.style.resize = 'none'
    input.style.lineHeight = '16px'
    input.style.overflow = 'hidden'

    // // Handle input completion
    input.onblur = () => {
      input.remove() // Remove input on blur
      graphCanvas.setDirty(true, true) // Redraw canvas
    }

    input.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        // input.blur()
        this.properties.value = input.value
        input.remove()
        graphCanvas.setDirty(true, true) // Redraw canvas
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        input.remove() // Cancel editing without saving
        graphCanvas.setDirty(true, true) // Redraw canvas
      }
    }

    document.body.appendChild(input)
    input.focus()
    // input.select() // Select all text for easy editing

    // Trigger redraw to hide canvas text while editing
    graphCanvas.setDirty(true, true)
  }
}
