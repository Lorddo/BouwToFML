/** @vitest-environment jsdom */
import { createCanvas } from 'canvas'
import { describe, expect, it } from 'vitest'
import {
  applyInkBrush,
  applyInkErase,
  applyInkLine,
  applyInkRect,
  cloneSourceToEditCanvas,
} from '@/cv/tools/inkEdit'

function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number] {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no ctx')
  const data = ctx.getImageData(x, y, 1, 1).data
  return [data[0], data[1], data[2]]
}

function whiteCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = createCanvas(w, h) as unknown as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  return canvas
}

describe('inkEdit', () => {
  it('cloneSourceToEditCanvas kopieert bronpixels', () => {
    const source = whiteCanvas(4, 4)
    const ctx = source.getContext('2d')!
    ctx.fillStyle = '#000000'
    ctx.fillRect(1, 1, 1, 1)
    const cloned = cloneSourceToEditCanvas(source)
    expect(pixelAt(cloned, 1, 1)).toEqual([0, 0, 0])
    expect(pixelAt(cloned, 0, 0)).toEqual([255, 255, 255])
  })

  it('applyInkBrush tekent doorlopende lijn zonder gaten', () => {
    const canvas = whiteCanvas(40, 40)
    applyInkBrush(
      canvas,
      [
        { x: 4, y: 20 },
        { x: 12, y: 20 },
        { x: 20, y: 20 },
        { x: 28, y: 20 },
        { x: 36, y: 20 },
      ],
      2,
    )
    for (let x = 4; x <= 36; x += 1) {
      expect(pixelAt(canvas, x, 20)).toEqual([0, 0, 0])
    }
  })

  it('applyInkBrush tekent zwarte inkt', () => {
    const canvas = whiteCanvas(20, 20)
    applyInkBrush(canvas, [{ x: 10, y: 10 }], 2)
    expect(pixelAt(canvas, 10, 10)).toEqual([0, 0, 0])
  })

  it('applyInkErase wist naar wit', () => {
    const canvas = whiteCanvas(20, 20)
    applyInkBrush(canvas, [{ x: 10, y: 10 }], 3)
    applyInkErase(canvas, [{ x: 10, y: 10 }], 3)
    expect(pixelAt(canvas, 10, 10)).toEqual([255, 255, 255])
  })

  it('applyInkLine tekent segment', () => {
    const canvas = whiteCanvas(30, 10)
    applyInkLine(canvas, { x: 2, y: 5 }, { x: 28, y: 5 }, 2)
    expect(pixelAt(canvas, 15, 5)).toEqual([0, 0, 0])
    expect(pixelAt(canvas, 0, 0)).toEqual([255, 255, 255])
  })

  it('applyInkRect heeft gelijke dikte op alle zijden', () => {
    const canvas = whiteCanvas(30, 30)
    applyInkRect(canvas, { x: 5, y: 5, width: 20, height: 16 }, 3)
    // top (y=5..7)
    expect(pixelAt(canvas, 10, 6)).toEqual([0, 0, 0])
    // bottom (y=18..20)
    expect(pixelAt(canvas, 10, 19)).toEqual([0, 0, 0])
    // left (x=5..7)
    expect(pixelAt(canvas, 6, 12)).toEqual([0, 0, 0])
    // right (x=22..24)
    expect(pixelAt(canvas, 23, 12)).toEqual([0, 0, 0])
    // binnen vlak wit
    expect(pixelAt(canvas, 15, 12)).toEqual([255, 255, 255])
  })

  it('applyInkRect tekent outline', () => {
    const canvas = whiteCanvas(20, 20)
    applyInkRect(canvas, { x: 4, y: 4, width: 10, height: 8 }, 2)
    expect(pixelAt(canvas, 4, 4)).toEqual([0, 0, 0])
    expect(pixelAt(canvas, 9, 9)).toEqual([255, 255, 255])
  })
})
