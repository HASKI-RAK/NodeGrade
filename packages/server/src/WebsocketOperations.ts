/* eslint-disable immutable/no-mutation */
import {
  AnswerInputNode,
  ClientEventPayload,
  LGraph,
  OutputNode,
  sendWs,
  SerializedGraph
} from '@haski/ta-lib'
import { IncomingMessage } from 'http'
import { parse } from 'url'
import { WebSocket } from 'ws'

import prisma from './client'
import { runLgraph, sendQuestion } from './Graph'
import { log, xAPI } from './server'
import { prismaGraphCreateOrUpdate } from './utils/prismaOperations'

export async function runGraph(
  payload: ClientEventPayload['runGraph'],
  ws: WebSocket,
  lgraph: LGraph
): Promise<void> {
  log.debug('event: runGraph')
  const timeItStart = Date.now()
  lgraph.configure(payload.graph)
  // set answer for nodes
  lgraph.findNodesByClass<AnswerInputNode>(AnswerInputNode).forEach((node) => {
    //TODO: Make this extendible only take the first 700 characters
    node.properties.value = payload.answer.substring(0, 700)
  })
  try {
    // RUN GRAPH ITERATION
    await runLgraph(lgraph, (percentage) => {
      // only send every 10%
      sendWs(ws, {
        eventName: 'processingPercentageUpdate',
        payload: Number(percentage.toFixed(2)) * 100
      })
    })
    log.debug('Finished running graph')
    const resultNodes = lgraph.findNodesByClass<OutputNode>(OutputNode)
    log.debug(
      'Output nodes: ',
      resultNodes.map((node) => node.properties)
    )
    const outputs = resultNodes.map((node) => node.properties)
    try {
      // xAPI.sendStatement({
      //   statement: {
      //     actor: {
      //       name: 'User',
      //       mbox: 'mailto:test@test.org'
      //     },
      //     verb: {
      //       id: 'https://wiki.haski.app/variables/services.answered',
      //       display: {
      //         en: 'answered'
      //       }
      //     },
      //     object: {
      //       id: 'https://wiki.haski.app/functions/TextField',
      //       definition: {
      //         name: {
      //           en: 'TextField'
      //         },
      //         extensions: {
      //           'https://ta.haski.app/variables/services.user_id': payload.user_id,
      //           'https://ta.haski.app/variables/services.answered': payload.answer,
      //           'https://ta.haski.app/variables/services.timestamp': payload.timestamp,
      //           'https://ta.haski.app/variables/services.domain': payload.domain,
      //           'https://ta.haski.app/variables/services.outputs': outputs
      //         }
      //       }
      //     },
      //     timestamp: new Date().toISOString()
      //   }
      // })
    } catch (error) {
      log.error('Error sending xAPI statement: ', error)
    }
    sendWs(ws, {
      eventName: 'graphFinished',
      payload: lgraph.serialize<SerializedGraph>()
    })
  } catch (error) {
    log.error('Error running graph: ', error)
  }
  const timeItEnd = Date.now()
  log.info('Time it took to run graph: ', timeItEnd - timeItStart)
}

export async function saveGraph(
  payload: ClientEventPayload['saveGraph'],
  lgraph: LGraph,
  request: IncomingMessage,
  ws: WebSocket
): Promise<void> {
  log.debug('event: saveGraph')
  lgraph.configure(payload.graph)
  const name = payload.name ?? parse(request.url ?? '', true).pathname
  log.trace('Saving graph with name: ', name)
  await prismaGraphCreateOrUpdate(prisma, name, lgraph)
  sendWs(ws, {
    eventName: 'graphSaved',
    payload: lgraph.serialize<SerializedGraph>()
  })
  sendQuestion(lgraph, ws)
}
