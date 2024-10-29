/* eslint-disable simple-import-sort/imports */
/* eslint-disable immutable/no-mutation */
import {
  AnswerInputNode,
  assertIs,
  ClientBenchmarkPostPayload,
  LiteGraph,
  OutputNode,
  QuestionNode,
  ServerBenchmarkPostPayload
} from '@haski/ta-lib'
import { SampleSolutionNode } from '@haski/ta-lib/nodes/SampleSolutionNode'

import prisma from '../client'
import { addOnNodeAdded, runLgraph } from '../Graph'
import { log, xAPI } from '../server'
import { RestHandlerMap } from '../utils/rest'
import { isPayloadClientBenchmarkValid } from '../utils/typeGuards'
import { handleLtiToolRegistration, ToolRegistrationRequest } from './handleLti'
import {
  isPayloadLtiLaunchValid,
  LtiBasicLaunchRequest,
  LtiLaunchRequest
} from '@haski/lti'
import XAPI from '@xapi/xapi'

// Define your REST handlers
// always sanity check the payload before using it
export const handlers: RestHandlerMap<
  | ClientBenchmarkPostPayload
  | ToolRegistrationRequest
  | LtiLaunchRequest
  | LtiBasicLaunchRequest
  | undefined
> = {
  POST: {
    '/v1/benchmark': async (_, response, payload) => {
      assertIs(payload, isPayloadClientBenchmarkValid)
      const benchmarkPayload = payload
      const { path, data } = benchmarkPayload

      const graph = await prisma.graph.findFirst({
        where: {
          path
        }
      })

      if (!graph) {
        response.writeHead(404)
        response.end()
        return
      }

      const lgraph = new LiteGraph.LGraph()
      addOnNodeAdded(lgraph, undefined, true)
      lgraph.configure(JSON.parse(graph.graph))

      // Fill in the answer and question
      lgraph.findNodesByClass(AnswerInputNode).forEach((node) => {
        node.properties.value = data.answer
      })
      lgraph.findNodesByClass(QuestionNode).forEach((node) => {
        node.properties.value = data.question
      })
      lgraph.findNodesByClass(SampleSolutionNode).forEach((node) => {
        node.properties.value = data.realAnswer
      })

      // Run the graph
      runLgraph(lgraph).then(() => {
        const output: ServerBenchmarkPostPayload = lgraph
          .findNodesByClass(OutputNode)
          .map((node) => {
            return node.properties.value
          })
        log.debug('Benchmark post response: ', output)
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.write(JSON.stringify(output))
        response.end()
      })
    },
    '/v1/lti/basiclogin': async (_, response, p) => {
      // assertIs(payload, isBasicLtiLaunchValid)
      const payload = p as LtiBasicLaunchRequest
      try {
        // visit with get request openID configuration endpoint to retreieve registration endpoint:
        // const launch_response = await launchTool(id_token, state)
        // log.debug('Launch response: ', launch_response)
        // response.writeHead(launch_response.status)
        // response.end(launch_response.statusText)
        log.debug('Basic LTI Launch Request with payload: ', payload)
        const timestamp = new Date().toISOString()
        const roles = payload.roles.split(',')
        xAPI.sendStatement({
          statement: {
            actor: {
              name: 'User',
              mbox: 'mailto:' + payload.lis_person_contact_email_primary
            },
            verb: XAPI.Verbs.INITIALIZED,
            object: {
              id: 'https://ta.haski.app/lti/basiclogin',
              definition: {
                name: {
                  en: 'LTI Basic Login'
                },
                description: {
                  en: payload.lti_message_type
                },
                moreInfo: payload.launch_presentation_return_url,
                extensions: {
                  'https://ta.haski.app/lti/basiclogin': {
                    payload: payload
                  }
                }
              }
            },
            timestamp: timestamp
          }
        })
        const isEditor = roles.includes('Instructor') || roles.includes('Administrator')
        // redirect to the tool frontend
        response.writeHead(302, {
          Location:
            (process.env.FRONTEND_URL ?? 'http://localhost:5173').trim() +
            '/ws/' +
            (isEditor ? 'editor' : 'student') +
            '/' +
            payload.custom_activityname +
            '/1/1?user_id=' +
            payload.user_id +
            '&timestamp=' +
            timestamp
        })
      } catch (e) {
        // response.writeHead(400, {
        //   'Content-Type': 'application/json',
        //   'Access-Control-Allow-Origin': '*'
        // })
        log.error('Invalid Tool Launch Request')
      }
    },
    '/v1/lti/login': async (_, response, payload) => {
      assertIs(payload, isPayloadLtiLaunchValid)
      try {
        // visit with get request openID configuration endpoint to retreieve registration endpoint:
        // const launch_response = await launchTool(id_token, state)
        // log.debug('Launch response: ', launch_response)
        // response.writeHead(launch_response.status)
        // response.end(launch_response.statusText)

        // redirect to the tool frontend
        response.writeHead(302, {
          Location: 'http://localhost:5173/ws/editor/lol/1/2'
        })
        response.end()
      } catch (e) {
        response.writeHead(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        })
      }
    }
  },
  GET: {
    '/v1/graphs': async (_, response) => {
      // getting all available graphs
      try {
        const graphs = await prisma.graph.findMany()
        response.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        })
        response.write(JSON.stringify(graphs))
      } catch (e) {
        // response.writeHead(500, {
        //   'Content-Type': 'application/json',
        //   'Access-Control-Allow-Origin': '*'
        // })
        log.error('Error while fetching graphs')
      }
    },
    '/v1/lti/register': async (request, response) =>
      handleLtiToolRegistration(request, response),

    '/.well-known/jwks': async (_, response) => {
      const jwks = {
        kty: 'RSA',
        e: 'AQAB',
        use: 'sig',
        alg: 'RS256',
        n: 'hR3jOA4mku32gDGv34I3Zib6BnRXVN0rcVob0BO4TcAzD1awg7ROaKyK8jKPOR7O-0k4u4AyICbtVgcmm5kubgDAb7xVG4wtKxah4Dca2kWXuUIvzmq-s1olOv9_8DB0ZwaWOpi6o_Vji-GCq5_ZrD2vd0UKBlFRVMgvSo7aPU5yF6ai7gHX6nlk76PPubSfoZ4r8FKwCE46SPZdsFEmr-BYsOtlGEpVendLC5SGbAI7udhVSN026QOrqmiPIBYuFfMq05YVnROWutNriuIzGFAMzv5c2yvWuo_aBO3Y3_41hK8hnzZAP1bKbvktlc1vlytzqwiWU2DnekLVHlHcHQ'
      }
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      })
      response.write(JSON.stringify(jwks))
    },
    '/policy': async (_, response) => {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      })
      response.write(JSON.stringify({ policy: 'here could be your policy' }))
    }
  }
}
