import { IncomingMessage, ServerResponse } from 'http'

import {
  extractBasicLtiLaunchRequest,
  extractLtiLaunchRequest
} from '../handlers/handleLti'
import { handlers } from '../handlers/RequestHandlers'
import { log } from '../server'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type RestRequestHandler<T> = (
  request: IncomingMessage,
  response: ServerResponse,
  payload?: T
) => Promise<void>

export type RestHandlerMap<T> = {
  [K in HttpMethod]?: {
    [route: string]: RestRequestHandler<T>
  }
}

export type RestRequest<T> = {
  method: HttpMethod
  route: string
  payload?: T
}

export const handleRestRequest = async <T>(
  request: IncomingMessage,
  response: ServerResponse,
  restRequest: RestRequest<T>,
  handlers: RestHandlerMap<T>
): Promise<void> => {
  const { method, route, payload } = restRequest
  const methodHandlers = handlers[method]

  if (methodHandlers) {
    const handler = methodHandlers[route]
    if (handler) {
      log.trace('Handling request:', restRequest)
      await handler(request, response, payload)
      log.trace('Request handled:', restRequest)
    } else {
      log.error('Route not found:', restRequest)
    }
  } else {
    log.error('Method not allowed:', restRequest)
  }
}

export async function handleRestRequestWithPayload(
  request: IncomingMessage,
  method: HttpMethod,
  route: string,
  response: ServerResponse
) {
  const requestBody: Buffer[] = []
  request.on('data', (chunk) => requestBody.push(chunk))
  await new Promise<void>((resolve) => {
    request.on('end', async () => {
      const payload = JSON.parse(Buffer.concat(requestBody).toString())
      log.trace('Payload:', payload)
      const restRequest: RestRequest<typeof payload> = {
        method,
        route,
        payload
      }
      await handleRestRequest(request, response, restRequest, handlers)
      resolve()
    })
  })
}

export const handleRestRequestWithFormData = (
  request: IncomingMessage,
  method: HttpMethod,
  route: string,
  response: ServerResponse
) => {
  const requestBody: Buffer[] = []
  request.on('data', (chunk) => requestBody.push(chunk))
  request.on('end', async () => {
    const payload = Buffer.concat(requestBody).toString()
    // parse form data
    const parsedPayload = new URLSearchParams(payload)
    const ltiLaunchRequest = extractLtiLaunchRequest(parsedPayload) ?? undefined
    if (!ltiLaunchRequest) {
      const ltiBasicLaunchRequest =
        extractBasicLtiLaunchRequest(parsedPayload) ?? undefined
      const restRequest: RestRequest<typeof ltiBasicLaunchRequest> = {
        method,
        route,
        payload: ltiBasicLaunchRequest
      }
      handleRestRequest(request, response, restRequest, handlers)
    }
    const restRequest: RestRequest<typeof ltiLaunchRequest> = {
      method,
      route,
      payload: ltiLaunchRequest
    }
    console.log('payload', payload)
    console.log('restRequest', restRequest)
    await handleRestRequest(request, response, restRequest, handlers)
  })
}
