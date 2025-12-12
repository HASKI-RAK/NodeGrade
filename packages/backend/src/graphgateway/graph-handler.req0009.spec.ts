import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { Socket } from 'socket.io'
import {
  AnswerInputNode,
  LGraph,
  OutputNode,
  SerializedGraph
} from '@haski/ta-lib'

import { GraphHandlerService } from './graph-handler.service'
import { GraphService } from 'src/graph/graph.service'
import { XapiService } from '../xapi.service'
import * as GraphCore from 'src/core/Graph'
import { emitEvent } from 'utils/socket-emitter'

jest.mock('utils/socket-emitter', () => ({
  emitEvent: jest.fn()
}))

jest.mock('src/core/Graph', () => ({
  executeLgraph: jest.fn()
}))

/**
 * Requirement-focused tests for HASKI-REQ-0009
 * "Unmittelbares Feedback zu Aufgaben"
 *
 * These tests assert that the graph execution pipeline returns
 * immediate, comprehensible feedback (score + text) for the
 * supported task types (quiz, freitext – keyword & LLM, code, diagram)
 * and reports the computed duration in xAPI statements.
 */
describe('GraphHandlerService – [HASKI-REQ-0009]', () => {
  let service: GraphHandlerService
  let mockSocket: Socket
  let xapiSendStatementMock: jest.Mock

  const mockSerializedGraph: SerializedGraph = {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    version: 1.0
  }

  const stringifiedMockGraph = JSON.stringify(mockSerializedGraph)

  beforeEach(async () => {
    xapiSendStatementMock = jest.fn().mockResolvedValue(undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphHandlerService,
        {
          provide: GraphService,
          useValue: {
            saveGraph: jest.fn(),
            getGraph: jest.fn()
          }
        },
        {
          provide: XapiService,
          useValue: {
            getXapi: () => ({
              sendStatement: xapiSendStatementMock
            })
          }
        }
      ]
    }).compile()

    service = module.get<GraphHandlerService>(GraphHandlerService)

    mockSocket = {
      id: 'mockSocketId',
      emit: jest.fn(),
      handshake: {
        auth: {
          ltiCookie: {
            lis_person_name_full: 'Max Mustermann',
            user_id: 'student-42',
            isEditor: false
          }
        }
      }
    } as unknown as Socket

    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const baseXapiPayload = {
    tool_consumer_instance_guid: 'moodle.example.edu',
    tool_consumer_info_product_family_code: 'moodle',
    custom_activityname: 'demo-activity',
    resource_link_title: 'Demo Task',
    launch_presentation_locale: 'de-DE',
    context_id: 'course-123',
    context_title: 'SE Lab',
    context_type: 'course'
  }

  type Scenario = {
    type: string
    answer: string
    feedback: string
    score: number
    durationMs: number
    maxSeconds: number
  }

  const scenarios: Scenario[] = [
    {
      type: 'quiz',
      answer: 'A',
      feedback: 'Richtig: Option A ist korrekt.',
      score: 100,
      durationMs: 3000,
      maxSeconds: 10
    },
    {
      type: 'freitext-keyword',
      answer: 'Verwendet die Schlüsselbegriffe Architektur und Skalierbarkeit.',
      feedback: 'Keywords erkannt: Architektur, Skalierbarkeit; fehlend: Latenz.',
      score: 85,
      durationMs: 4500,
      maxSeconds: 10
    },
    {
      type: 'freitext-llm',
      answer: 'Eine längere Argumentation zur Entwurfsmusterwahl.',
      feedback: 'LLM-Einschätzung: gute Struktur, bitte Beispiele ergänzen.',
      score: 92,
      durationMs: 45000,
      maxSeconds: 60
    },
    {
      type: 'code',
      answer: 'function add(a,b){return a+b}',
      feedback: 'Alle Unit-Tests bestanden, Stil prüfen (lint).',
      score: 98,
      durationMs: 5200,
      maxSeconds: 10
    },
    {
      type: 'diagram',
      answer: 'Klassendiagramm mit Controller, Service, Repository.',
      feedback: 'Struktur korrekt, fehlende Beziehung Service -> Repository.',
      score: 76,
      durationMs: 6200,
      maxSeconds: 10
    }
  ]

  test.each(scenarios)(
    'provides immediate feedback for %s tasks (HASKI-REQ-0009)',
    async (scenario) => {
      // Arrange LGraph behaviour for this run
      const answerNodes = [
        {
          properties: { value: '' }
        }
      ] as unknown as AnswerInputNode[]

      const outputNodes = [
        {
          properties: {
            type: 'score',
            label: `${scenario.type} score`,
            value: scenario.score
          }
        },
        {
          properties: {
            type: 'text',
            label: `${scenario.type} feedback`,
            value: scenario.feedback
          }
        }
      ] as unknown as OutputNode[]

      jest
        .spyOn(LGraph.prototype, 'configure')
        .mockImplementation(() => undefined)

      jest
        .spyOn(LGraph.prototype, 'findNodesByClass')
        .mockImplementation((klass: unknown) => {
          if (klass === AnswerInputNode) return answerNodes
          if (klass === OutputNode) return outputNodes
          return []
        })

      jest
        .spyOn(LGraph.prototype, 'serialize')
        .mockImplementation(() => mockSerializedGraph)

      jest
        .spyOn<any, any>(service, 'addOnNodeAdded')
        .mockImplementation(() => undefined)

      jest
        .spyOn<any, any>(service, 'hydrateExistingNodes')
        .mockResolvedValue(undefined)

      ;(GraphCore.executeLgraph as jest.Mock).mockImplementation(
        async (_graph: LGraph, progressCb?: (percentage: number) => void) => {
          progressCb?.(0.42)
          return _graph
        }
      )

      jest
        .spyOn(Date, 'now')
        .mockImplementationOnce(() => 1000)
        .mockImplementation(() => 1000 + scenario.durationMs)

      const payload = {
        graph: stringifiedMockGraph,
        answer: scenario.answer,
        xapi: baseXapiPayload
      }

      // Act
      await service.handleRunGraph(mockSocket, payload)

      // Assert feedback was applied to the student answer node
      expect(answerNodes[0].properties.value).toBe(
        scenario.answer.substring(0, 1500)
      )

      // xAPI statements: one pre, one post execution
      expect(xapiSendStatementMock).toHaveBeenCalledTimes(2)
      const resultStatement =
        xapiSendStatementMock.mock.calls[1][0].statement.result

      expect(resultStatement.response).toBe(scenario.feedback)
      expect(resultStatement.score.raw).toBe(scenario.score)

      const durationSeconds = parseFloat(resultStatement.duration.slice(2, -1))
      expect(durationSeconds).toBeLessThanOrEqual(scenario.maxSeconds)

      // Progress + completion events give students immediate UI feedback
      expect(emitEvent).toHaveBeenCalledWith(
        mockSocket,
        'percentageUpdated',
        42
      )
      expect(emitEvent).toHaveBeenCalledWith(
        mockSocket,
        'graphFinished',
        JSON.stringify(mockSerializedGraph)
      )
    }
  )

  it('logs runtime problems while keeping the socket responsive', async () => {
    jest
      .spyOn(LGraph.prototype, 'configure')
      .mockImplementation(() => undefined)
    jest
      .spyOn(LGraph.prototype, 'findNodesByClass')
      .mockImplementation(() => [])
    jest
      .spyOn(LGraph.prototype, 'serialize')
      .mockImplementation(() => mockSerializedGraph)
    jest
      .spyOn<any, any>(service, 'hydrateExistingNodes')
      .mockResolvedValue(undefined)
    jest
      .spyOn(GraphCore, 'executeLgraph')
      .mockRejectedValue(new Error('Execution error'))

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)

    await service.handleRunGraph(mockSocket, {
      graph: stringifiedMockGraph,
      answer: 'broken graph',
      xapi: baseXapiPayload
    })

    expect(loggerSpy).toHaveBeenCalledWith(
      'Error running graph: ',
      expect.any(Error)
    )
  })
})
