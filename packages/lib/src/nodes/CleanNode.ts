/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */

import { LGraphNode, LiteGraph } from './litegraph-extensions'
import stemmer from './utils/PorterStemmer'
/**
 * * This node is used to limit the amount of characters a user can input
 * * It is used in the frontend to limit the amount of characters a user can input
 */
export class CleanNode extends LGraphNode {
  properties: {
    value: string
    trim: boolean
    space: boolean
    doubleSpace: boolean
    dot: boolean
    comma: boolean
    lower: boolean
    upper: boolean
    stem: boolean
  }
  constructor() {
    super()
    this.properties = {
      value: '',
      trim: false, // trim start and end
      space: false, // remove spaces
      doubleSpace: false, // remove double spaces
      dot: false, // remove dots
      comma: false, // remove commas
      lower: false, // lowercase
      upper: false, // uppercase
      stem: false // porter stemmer
    }
    this.addIn('string')
    this.addWidget('toggle', 'trim start and end', this.properties.trim, (v) => {
      this.properties.trim = v
    })
    this.addWidget('toggle', 'remove spaces', this.properties.space, (v) => {
      this.properties.space = v
    })
    this.addWidget('toggle', 'remove double spaces', this.properties.doubleSpace, (v) => {
      this.properties.doubleSpace = v
    })
    this.addWidget('toggle', 'remove dots', this.properties.dot, (v) => {
      this.properties.dot = v
    })
    this.addWidget('toggle', 'remove commas', this.properties.comma, (v) => {
      this.properties.comma = v
    })
    this.addWidget('toggle', 'lowercase', this.properties.lower, (v) => {
      this.properties.lower = v
    })
    this.addWidget('toggle', 'uppercase', this.properties.upper, (v) => {
      this.properties.upper = v
    })
    this.addWidget('toggle', 'porter stemmer', this.properties.stem, (v) => {
      this.properties.stem = v
    })
    this.addOut('string')
    this.serialize_widgets = true
    this.title = 'clean'
  }

  // statics
  static title = 'clean'

  static path = 'preprocessing/clean'

  static getPath(): string {
    return CleanNode.path
  }

  //name of the function to call when executing
  async onExecute() {
    if (this.inputs[0]) {
      this.properties.value = this.getInputData(0)
    }
    if (this.properties.trim) {
      this.properties.value = this.properties.value.trim()
    }
    if (this.properties.space) {
      this.properties.value = this.properties.value.replace(/\s/g, '')
    }
    if (this.properties.doubleSpace) {
      this.properties.value = this.properties.value.replace(/\s\s/g, ' ')
    }
    if (this.properties.dot) {
      this.properties.value = this.properties.value.replace(/\./g, '')
    }
    if (this.properties.comma) {
      this.properties.value = this.properties.value.replace(/,/g, '')
    }
    if (this.properties.lower) {
      this.properties.value = this.properties.value.toLowerCase()
    }
    if (this.properties.upper) {
      this.properties.value = this.properties.value.toUpperCase()
    }
    if (this.properties.stem) {
      this.properties.value = stemmer(this.properties.value)
    }

    this.setOutputData(0, this.properties.value)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(CleanNode.path, CleanNode)
  }
}
