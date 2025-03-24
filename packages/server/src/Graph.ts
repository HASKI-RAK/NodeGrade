/* eslint-disable immutable/no-mutation */
import { LGraph, LGraphNode, LiteGraph, QuestionNode, sendWs } from '@haski/ta-lib'
import { ImageNode } from '@haski/ta-lib/nodes/ImageNode'
import { WebSocket } from 'ws'

import prisma from './client'
import { log } from './server'
import * as demoGraphJson from './utils/RunOne.json'

/**
 * Sends a graph from a given path to a WebSocket.
 *
 * @param ws - The WebSocket to send the graph to.
 * @param pathname - The path to the graph. In the database.
 * @returns The LiteGraph instance representing the graph.
 */
export async function setupGraphFromPath(
  ws: WebSocket,
  pathname: string
): Promise<LGraph> {
  log.debug('Setup graph from path')
  // TODO: get graph from path
  const lgraph = new LiteGraph.LGraph()
  log.debug('Loading graph from DB for route: ', pathname)
  const loaded_graph = await prisma.graph.findFirst({
    where: {
      path: pathname
    }
  })

  // This is persisted even trough network serialization
  // eslint-disable-next-line immutable/no-mutation
  addOnNodeAdded(lgraph, ws)
  if (loaded_graph) {
    lgraph.configure(JSON.parse(loaded_graph.graph))
    const execorder = lgraph.computeExecutionOrder<LGraphNode[]>(false, true)
    for (const [, node] of execorder.entries()) await node.init?.(process.env)

    sendWs(ws, { eventName: 'graphFinished', payload: lgraph.serialize() })

    sendQuestion(lgraph, ws)
    sendImages(ws, lgraph)
    return lgraph
  } else {
    // ? test graph
    const test = testGraph(lgraph, ws)
    test.clear()
    return test
    return testGraph(lgraph, ws)
  }
}

export function addOnNodeAdded(
  lgraph: LGraph,
  ws?: WebSocket,
  benchmark: boolean = false
) {
  lgraph.onNodeAdded = function (node: LGraphNode) {
    if (!benchmark && ws) node.setWebSocket?.(ws) // register websocket if node uses it

    const onExecute = node.onExecute
    // eslint-disable-next-line immutable/no-mutation
    node.onExecute = async function () {
      log.debug(`Executing node: ${node.title}`)
      // tell client that we are executing this node
      if (!benchmark && ws) sendWs(ws, { eventName: 'nodeExecuting', payload: node.id })

      //! Set node properties
      // await new Promise((resolve) => setTimeout(resolve, 200))
      // eslint-disable-next-line immutable/no-mutation
      node.color = LiteGraph.NODE_DEFAULT_COLOR
      await onExecute?.call(node).catch((error) => {
        log.error(error)
        // TODO set node color to red
        // eslint-disable-next-line immutable/no-mutation
        node.color = '#ff0000'
        if (!benchmark && ws) {
          sendWs(ws, {
            eventName: 'nodeError',
            payload: {
              nodeId: node.id,
              error:
                "Error while executing node: '" +
                node.title +
                "' with error: " +
                JSON.stringify(error.message)
            }
          })
        }
      })
      if (!benchmark && ws) {
        log.debug(`Executed node: ${node.title}`)
        sendWs(ws, { eventName: 'nodeExecuted', payload: node.id })
      }
    }
  }
}

export function sendQuestion(lgraph: LGraph, ws: WebSocket) {
  const question = lgraph.findNodesByClass(QuestionNode).pop()
  if (question) {
    // send question
    log.debug('Sending question: ', question.properties.value)
    sendWs(ws, {
      eventName: 'question',
      payload: question.properties.value
    })
  }
}

export const sendImages = (ws: WebSocket, lgraph: LGraph) => {
  const images = lgraph.findNodesByClass(ImageNode)

  for (const image of images) {
    if (!image.properties.imageUrl) continue
    log.debug('Sending image: ', image.properties_info)
    sendWs(ws, {
      eventName: 'questionImage',
      payload: image.properties.imageUrl
    })
  }
}

function testGraph(lgraph: LGraph, ws: WebSocket) {
  lgraph.configure(demoGraphJson)
  sendWs(ws, { eventName: 'graphFinished', payload: lgraph.serialize() })
  return lgraph
}

/**
 * Run the graph in order
 * first compute the execution order
 * then run each node
 * @async
 * @param lgraph - graph to run
 */
export async function runLgraph(
  lgraph: LGraph,
  updateProggresCb?: (progress: number) => void,
  onlyOnExecute = false
) {
  const execorder = lgraph.computeExecutionOrder<LGraphNode[]>(onlyOnExecute, true)
  for (const [index, node] of execorder.entries()) {
    try {
      await node.onExecute?.()
      updateProggresCb?.(index / execorder.length)
    } catch (error) {
      // log.warn(error)
      // TODO reset node green states
    }
  }
  return lgraph
}
