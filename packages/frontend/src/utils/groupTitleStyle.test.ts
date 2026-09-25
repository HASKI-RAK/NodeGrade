import { CANVAS_THEME, LiteGraph } from '@haski/ta-lib'
import type { LGraphCanvas } from 'litegraph.js'
import { describe, expect, it, vi } from 'vitest'

import { installGroupTitleStyle } from './groupTitleStyle'

const makeCanvas = (fontSize = 24) => {
  const operations: string[] = []
  const drawGroups = vi.fn(() => operations.push('stock'))
  const fills: Array<{ color: string; rect: number[] }> = []
  const texts: Array<{
    color: string
    font: string
    text: string
    x: number
    y: number
  }> = []
  let fillStyle = ''
  let font = ''
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
    },
    get font() {
      return font
    },
    set font(value: string) {
      font = value
    },
    fillRect: (...rect: number[]) => {
      operations.push('fill')
      fills.push({ color: fillStyle, rect })
    },
    fillText: (text: string, x: number, y: number) => {
      operations.push('text')
      texts.push({ color: fillStyle, font, text, x, y })
    }
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    drawGroups,
    editor_alpha: 0.8,
    graph: {
      _groups: [
        {
          _pos: [100, 200],
          _size: [300, 180],
          font_size: fontSize,
          title: 'Evaluation'
        }
      ]
    }
  } as unknown as LGraphCanvas

  return { canvas, context, drawGroups, fills, operations, texts }
}

describe('installGroupTitleStyle', () => {
  it('paints the title background after the stock group body', () => {
    const { canvas, context, fills, operations, texts } = makeCanvas()
    installGroupTitleStyle(canvas)

    canvas.drawGroups(document.createElement('canvas'), context)

    expect(operations).toEqual(['stock', 'fill', 'text'])
    expect(fills).toEqual([{ color: CANVAS_THEME.nodeTitle, rect: [101, 201, 299, 24] }])
    expect(texts).toEqual([
      {
        color: LiteGraph.NODE_TITLE_COLOR,
        font: '24px Arial',
        text: 'Evaluation',
        x: 104,
        y: 224
      }
    ])
  })

  it('uses the group font size for the title background height', () => {
    const { canvas, context, fills } = makeCanvas(36)
    installGroupTitleStyle(canvas)

    canvas.drawGroups(document.createElement('canvas'), context)

    expect(fills[0]?.rect).toEqual([101, 201, 299, 36])
  })

  it('installs once', () => {
    const { canvas, context, drawGroups } = makeCanvas()
    installGroupTitleStyle(canvas)
    const installedDrawGroups = canvas.drawGroups
    installGroupTitleStyle(canvas)

    canvas.drawGroups(document.createElement('canvas'), context)

    expect(canvas.drawGroups).toBe(installedDrawGroups)
    expect(drawGroups).toHaveBeenCalledOnce()
  })
})
