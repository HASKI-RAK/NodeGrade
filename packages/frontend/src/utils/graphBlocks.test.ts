import { describe, expect, it } from 'vitest'

import { parseBlockGraph } from './graphBlocks'

describe('block graph parsing', () => {
  it('accepts a serialized LiteGraph block', () => {
    expect(
      parseBlockGraph(
        JSON.stringify({
          nodes: [{ id: 7, type: 'basic/number', pos: [10, 20] }],
          links: []
        })
      ).nodes[0].id
    ).toBe(7)
  })

  it('rejects malformed content', () => {
    expect(() => parseBlockGraph('{"nodes":[{"type":"basic/number"}]}')).toThrow(
      'invalid graph content'
    )
  })
})
