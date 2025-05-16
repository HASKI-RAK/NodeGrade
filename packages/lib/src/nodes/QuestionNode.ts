/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-var */
/* eslint-disable immutable/no-let */
/* eslint-disable immutable/no-mutation */
/* eslint-disable immutable/no-this */
import { Textfield } from './Textfield'

export class QuestionNode extends Textfield {
  properties: { value: string }
  constructor() {
    super()
    this.properties = { value: 'Enter your question' }
    this.title = 'Question'
  }
  //name of the node
  static title = 'Question'
  static path = 'input/question'
  static getPath(): string {
    return QuestionNode.path
  }
}
