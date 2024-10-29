import { ClientEventPayload, handleWsRequest, WebSocketEvent } from '@haski/ta-lib'
import { parse } from 'url'
import { WebSocket } from 'ws'

import { setupGraphFromPath } from './Graph'
import { handlers } from './handlers/RequestHandlers'
import { log, serverType, wssType } from './server'
import {
  handleRestRequest,
  handleRestRequestWithFormData,
  handleRestRequestWithPayload,
  HttpMethod,
  RestRequest
} from './utils/rest'
import { runGraph, saveGraph } from './WebsocketOperations'
const addListeners = async (wss: wssType, server: serverType) => {
  /**
   **  Handle websocket connections on websocket server
   */
  wss.on('connection', async function connection(ws: WebSocket, request) {
    const timeItStart = Date.now()
    ws.on('error', (err) => {
      log.error('Websocket error: ', err)
    }) // TODO: Expand error handling
    log.info('Websocket connection established')
    const lgraph = await setupGraphFromPath(ws, request.url ?? '')

    // ! Register custom events
    log.debug('Registering custom events')
    ws.on('message', async function (message) {
      const timeItStartMessage = Date.now()
      const parsed: WebSocketEvent<ClientEventPayload> = JSON.parse(message.toString())

      handleWsRequest<ClientEventPayload>(parsed, {
        runGraph: (payload) => runGraph(payload, ws, lgraph),
        saveGraph: async (payload) => saveGraph(payload, lgraph, request, ws),
        loadGraph(payload) {
          log.debug('Loading graph from path: ', payload)
          setupGraphFromPath(ws, payload)
        }
      })
        .then((handled) => {
          if (!handled) {
            log.warn('Unhandled event: ', parsed.eventName)
          }
        })
        .catch((e) => {
          log.error('Error handling event: ', e)
        })
        .finally(() => {
          const timeItEndMessage = Date.now()
          log.info(
            'Time it took to handle message: ',
            timeItEndMessage - timeItStartMessage + 'ms'
          )
        })
    })
    const timeItEnd = Date.now()
    log.info('Time it took to setup graph: ', timeItEnd - timeItStart + 'ms')
  })

  /**
   ** Handle REST requests on http server
   */
  server.on('request', (request, response) => {
    const { pathname } = parse(request.url ?? '', true)
    const method = request.method as HttpMethod
    const route = pathname ?? '/'

    if (request.method === 'POST' || request.method === 'PUT') {
      // Parse the request body as needed
      //switch based on content type
      switch (request.headers['content-type']) {
        case 'application/json':
          handleRestRequestWithPayload(request, method, route, response)
          break
        case 'application/x-www-form-urlencoded':
          handleRestRequestWithFormData(request, method, route, response)
          break
        case 'multipart/form-data':
          handleRestRequestWithFormData(request, method, route, response)
          break
        default:
          response.writeHead(400)
          response.end('Invalid content type')
          break
      }
    } else if (request.method === 'GET' || request.method === 'DELETE') {
      const restRequest: RestRequest<undefined> = {
        method,
        route
      }
      handleRestRequest(request, response, restRequest, handlers)
    }
    // Handle options request
    else if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      response.writeHead(200)
      response.end()
    } else {
      // cors
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.writeHead(405)
      response.write('Method not allowed')
      response.end()
    }
  })
  /**
   ** Handle initial websocket connection on http server
   */
  server.on('upgrade', function upgrade(request, socket, head) {
    const { pathname } = parse(request.url ?? '', true)
    // Announce that we are going to handle this request
    log.trace('Handling request for ', pathname)

    if (pathname?.startsWith('/ws')) {
      //TODO: check path
      wss.handleUpgrade(request, socket, head, function done(ws) {
        wss.emit('connection', ws, request)
      })
    } else if (pathname === '/v1/chat/completions') {
      // send mock model response
      socket.write(
        JSON.stringify({
          id: 'mock',
          model: 'mock',
          created: new Date().toISOString(),
          choices: [
            {
              text: 'mock',
              index: 0,
              logprobs: null,
              finish_reason: 'length'
            }
          ]
        })
      )
    } else {
      socket.destroy()
      log.warn('Invalid path')
    }
  })
}

export default addListeners
