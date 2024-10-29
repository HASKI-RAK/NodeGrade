/* eslint-disable immutable/no-mutation */
// import dotenv
import dotenv from 'dotenv'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import express from 'express'

import prisma from './client'
import addListeners from './ServerEventListener'
import Logger from './utils/Logger'
// Init
const app = express()
const log = Logger.getInstance().log
export const server = createServer(app)

export type serverType = ReturnType<typeof createServer>
const wss = new WebSocketServer({ server })
export type wssType = WebSocketServer

dotenv.config()
// print env vars
log.info(
  'Environment variables: ',
  process.env.NODE_ENV,
  process.env.DATABASE_URL,
  process.env.MODEL_WORKER_URL,
  process.env.SIMILARITY_WORKER_URL
)

// Use CORS middleware
app.use(
  cors({
    // allow all origins
    origin: '*'
  })
)

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
