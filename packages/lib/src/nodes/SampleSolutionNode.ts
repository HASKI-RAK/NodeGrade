/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { Textfield } from './Textfield'

export class SampleSolutionNode extends Textfield {
  constructor() {
    super()
    this.properties = { value: 'Enter the sample solution.' }
    this.title = 'Sample solution'
  }
  //name of the node
  static title = 'Sample solution'
  static path = 'input/sample-solution'
  static getPath(): string {
    return SampleSolutionNode.path
  }
}
