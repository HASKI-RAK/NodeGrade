import {
  compactNodeWidgets,
  describeWatchHeader,
  describeWatchType,
  formatWatchValue,
  LGraph,
  LiteGraph,
  Watch,
  WATCH_MIN_HEIGHT
} from '@haski/ta-lib'
import { describe, expect, it } from 'vitest'

describe('watch node', () => {
  it.each([
    ['text', 'string'],
    [0.42, 'number'],
    [false, 'boolean'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['data:image/png;base64,AAAA', 'image'],
    [[1, 2], '[number]'],
    [['a', 'b'], '[string]'],
    [[{ role: 'user', content: 'Hi' }], '[message]'],
    [{ role: 'system', content: 'Be brief' }, 'message'],
    [[1, 'a'], 'array'],
    [[], 'array'],
    [{ score: 3 }, 'object']
  ])('names %j as %s', (value, type) => {
    expect(describeWatchType(value)).toBe(type)
  })

  it('formats every kind of value as readable text', () => {
    expect(formatWatchValue('')).toBe('(empty string)')
    expect(formatWatchValue(0)).toBe('0')
    expect(formatWatchValue(true)).toBe('true')
    expect(formatWatchValue(undefined)).toBe('no value')
    expect(formatWatchValue([0.1, 0.2])).toBe('[0.1,0.2]')
    expect(formatWatchValue({ score: 3 })).toBe('{"score":3}')
    expect(
      formatWatchValue([
        { role: 'system', content: 'Grade.' },
        { role: 'user', content: 'Answer' }
      ])
    ).toBe('system: Grade.\nuser: Answer')
    expect(formatWatchValue('data:image/png;base64,AAAA')).toBe('image/png · 3 B')
  })

  it('heads the value with its type and size', () => {
    expect(describeWatchHeader({ type: '[number]', value: [1, 2], truncated: false })).toBe(
      '[number] · 2 items'
    )
    expect(describeWatchHeader({ type: 'string', value: 'abc', truncated: false })).toBe(
      'string · 3 chars'
    )
    expect(describeWatchHeader({ type: 'object', value: '{"a', truncated: true })).toBe(
      'object · truncated'
    )
  })

  it('records its input as a trace row when it runs', async () => {
    const graph = new LGraph()
    const source = LiteGraph.createNode('basic/number')
    const watch = LiteGraph.createNode(Watch.getPath()) as Watch
    graph.add(source)
    graph.add(watch)
    source.connect(0, watch, 0)
    source.setOutputData(0, 7)
    await watch.onExecute()
    expect(watch.executionDetails).toEqual([
      { slot: 0, name: 'value', type: 'number', value: 7, truncated: false }
    ])
    expect(watch.properties).toEqual({})
  })

  it('keeps a resized watch tall and grows an old tiny one', () => {
    const watch = LiteGraph.createNode(Watch.getPath()) as Watch
    watch.size = [60, 30]
    compactNodeWidgets(watch)
    expect(watch.size).toEqual([180, WATCH_MIN_HEIGHT])
    watch.size = [300, 240]
    compactNodeWidgets(watch)
    expect(watch.size).toEqual([300, 240])
  })

  it('drops the value an old graph saved in the input label', () => {
    const graph = new LGraph()
    graph.configure({
      last_node_id: 1,
      last_link_id: 0,
      nodes: [
        {
          id: 1,
          type: 'basic/watch',
          pos: [0, 0],
          size: [60, 30],
          flags: {},
          mode: 0,
          order: 0,
          properties: { value: 0 },
          inputs: [{ name: '*', type: '*', link: null, label: '0.000' }]
        }
      ],
      links: [],
      groups: [],
      config: {},
      version: 0.4
    } as never)
    const watch = graph.getNodeById(1) as Watch
    expect(watch.inputs[0].label).toBeUndefined()
  })
})
