/* eslint-disable immutable/no-mutation */
import { LiteGraph } from './litegraph-extensions'
import { getDefinedNodeConstructors } from './NodeDefinitionRegistry'

export function LGraphRegisterCustomNodes() {
  // LiteGraph.clearRegisteredTypes() // Uncomment this line to clear all registered types during debugging or development.
  getDefinedNodeConstructors().forEach((Node) =>
    LiteGraph.registerNodeType(Node.getPath(), Node)
  )

  // Styling
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#272727'
  LiteGraph.NODE_DEFAULT_SHAPE = 'round'

  const graphInstance = LiteGraph // Create a new variable from LiteGraph
  return graphInstance // Return the new variable
}

export default LGraphRegisterCustomNodes
