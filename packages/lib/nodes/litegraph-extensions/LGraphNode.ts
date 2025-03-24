import { INodeInputSlot, INodeOutputSlot, LGraphNode as LGN } from 'litegraph.js'
import { WebSocket } from 'ws'

import WebSocketNode from '../behavior/WebSocketNode'
import { InOut } from '../types/NodeLinkMessage'

interface ILGraphNode extends LGN {
  onExecute(): Promise<void>
  init?(env: Record<string, unknown>): void
  env?: Record<string, unknown>
  addOut<T extends InOut>(
    type: T,
    name?: string,
    extra_info?: Partial<INodeOutputSlot>
  ): INodeOutputSlot
  addIn(type: InOut, name?: string, extra_info?: Partial<INodeInputSlot>): INodeInputSlot
}

// extend the LGraphNode class by adding a new method
export abstract class LGraphNode extends LGN implements ILGraphNode, WebSocketNode {
  env?: Record<string, unknown> | undefined
  ws: WebSocket | undefined
  static path: string
  static getPath(): string {
    throw new Error('getPath() not implemented')
  }
  async onExecute(): Promise<void> {
    throw new Error('onExecute() not implemented')
  }

  /**
   * @deprecated use addIn() instead
   */
  addInput(
    name: string | undefined,
    type: InOut,
    extra_info?: Partial<INodeInputSlot> | undefined
  ): INodeInputSlot {
    throw new Error(
      'deprecated. Called with: ' + type + name + extra_info + ' but use addIn() instead'
    )
  }

  /**
   * @deprecated use addIn() instead
   */
  addInputs(array: [string, string | -1, Partial<INodeInputSlot> | undefined][]): void {
    throw new Error('deprecated. Called with: ' + array + ' but use addIn() instead')
  }

  /**
   * @deprecated use addOut() instead
   */
  addOutputs(array: [string, string | -1, Partial<INodeOutputSlot> | undefined][]): void {
    throw new Error('deprecated. Called with: ' + array + ' but use addOut() instead')
  }

  /**
   * @deprecated use addOut() instead
   */
  addOutput(
    name: string,
    type: string | -1,
    extra_info?: Partial<INodeOutputSlot> | undefined
  ): INodeOutputSlot {
    throw new Error(
      'deprecated. Called with: ' + name + type + extra_info + ' but use addOut() instead'
    )
  }

  /**
   * Adds an input slot to the node.
   * @param type - The type of the input slot.
   * @param name - The name of the input slot. Optional.
   * @param extra_info - Additional information for the input slot. Optional.
   * @returns The added input slot.
   */
  addIn(
    type: InOut,
    name?: string | undefined,
    extra_info?: Partial<INodeInputSlot> | undefined
  ): INodeInputSlot {
    const _name = name ?? type
    return super.addInput(_name, type, {
      ...extra_info,
      ...LGraphNode.mapLinkTypeToColor(type)
    })
  }

  /**
   * Adds an output slot to the node.
   * @template T - The type of the output slot.
   * @param type - The type of the output slot.
   * @param name - The name of the output slot (optional).
   * @param extra_info - Additional information for the output slot (optional).
   * @returns The added output slot.
   */
  addOut<T extends InOut>(
    type: T,
    name?: string,
    extra_info?: Partial<INodeOutputSlot>
  ): INodeOutputSlot {
    const _name = name ?? type
    return super.addOutput(_name, type, {
      ...extra_info,
      ...LGraphNode.mapLinkTypeToColor(type)
    })
  }

  /**
   * Maps the link type to a color object.
   * @param type The link type.
   * @returns The color object corresponding to the link type.
   */
  static mapLinkTypeToColor(
    type: InOut
  ): { color_off: string; color_on: string } | undefined {
    const colorCodes: Record<InOut, { color_off: string; color_on: string }> = {
      boolean: { color_off: '#4400FF60', color_on: '#1900FF' },
      number: { color_off: '#FF000060', color_on: '#FF0000' },
      string: { color_off: '#00FF0060', color_on: '#00FF00' },
      message: { color_off: '#D9FF0060', color_on: '#D9FF00' },
      '[number]': { color_off: '#00FFFF60', color_on: '#00FFFF' },
      '[string]': { color_off: '#FF00FF60', color_on: '#FF00FF' },
      '*': { color_off: '#FFFFFF60', color_on: '#FFFFFF' },
      image: {
        color_off: '#FFA50060',
        color_on: '#FFA500'
      }
    }

    return colorCodes[type]
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setWebSocket?(_ws: WebSocket): void
  init?(env: Record<string, unknown>): Promise<void>
}

export default LGraphNode
