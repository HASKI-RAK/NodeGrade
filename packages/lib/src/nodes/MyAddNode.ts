/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { LGraphNode, LiteGraph } from './litegraph-extensions'

export class MyAddNode extends LGraphNode {
  constructor() {
    super()
    this.addIn('number', 'A')
    this.addIn('number', 'B')
    this.addOut('number', 'A+B')
    this.properties = { precision: 1, path: 'basic/sum' }
    this.title = 'sum'
  }

  //name of the node
  static title = 'sum'
  static path = 'basic/sum'
  static getPath(): string {
    return MyAddNode.path
  }

  //name of the function to call when executing
  async onExecute() {
    //get inputs
    let A = this.getInputData(0)
    if (A === undefined) {
      A = 0
    }
    let B = this.getInputData(1)
    if (B === undefined) {
      B = 0
    }

    //compute sum
    const C = A + B

    //send output to the output
    this.setOutputData(0, C)
  }

  //register in the system
  static register() {
    LiteGraph.registerNodeType(MyAddNode.path, MyAddNode)
  }
}
