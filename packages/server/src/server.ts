/* eslint-disable immutable/no-mutation */
// import dotenv
import XAPI from '@xapi/xapi'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'

import prisma from './client'
import addListeners from './ServerEventListener'
import Logger from './utils/Logger'
// Init
const app = express()
const log = Logger.getInstance().log
export const server = createServer()

export type serverType = ReturnType<typeof createServer>
const wss = new WebSocketServer({ noServer: true })
export type wssType = WebSocketServer

dotenv.config()
// print env vars
log.info(
  'Environment variables: ',
  process.env.NODE_ENV,
  process.env.DATABASE_URL,
  process.env.MODEL_WORKER_URL,
  process.env.SIMILARITY_WORKER_URL,
  process.env.XAPI_ENDPOINT,
  process.env.XAPI_USERNAME,
  process.env.XAPI_PASSWORD
)
// XAPI
export const xAPI = new XAPI({
  endpoint: process.env.XAPI_ENDPOINT ?? '',
  auth: XAPI.toBasicAuth(
    process.env.XAPI_USERNAME ?? '',
    process.env.XAPI_PASSWORD ?? ''
  ),
  version: '1.0.3'
})

// Use CORS middleware
app.use(
  cors({
    // allow all origins
    origin: '*'
  })
)
// server.on('request', async (request, response) => {
//   await new Promise((resolve) => {
//     setTimeout(resolve, 1000)
//   })
//   response.writeHead(200, { 'Content-Type': 'text/plain' })
//   response.end('okay')
// })

// Add listeners
addListeners(wss, server)
/**
 * ! Entry point
 * @async
 */
const main = async () => {
  log.info('Server listening on port: ', process.env.PORT ?? 5000)
  if (process.env.NODE_ENV !== 'test') {
    // https://stackoverflow.com/questions/60803230/node-eaddrinuse-address-already-in-use-3000-when-testing-with-jest-and-super
    server.listen(process.env.PORT ?? 5000)
  }
}

main().catch(async (e) => {
  log.error(e)
  await prisma.$disconnect()
  process.exit(1)
})

export { log }
