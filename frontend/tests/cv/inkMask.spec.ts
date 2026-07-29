import { describe, expect, it } from 'vitest'

import { countInkPixels, hasEnoughInkPixels, INK_DARK_THRESHOLD } from '@/cv/port/inkMask'

function mockMat(pixels: number[][]): {
  cols: number
  rows: number
  ucharPtr: (y: number, x: number) => Uint8Array
} {
  return {
    cols: pixels[0]?.length ?? 0,
    rows: pixels.length,
    ucharPtr: (y, x) => new Uint8Array([pixels[y][x]]),
  }
}

describe('inkMask', () => {
  it('telt alleen donkere pixels als inkt', () => {
    const mat = mockMat([
      [255, 255, 255],
      [255, 100, 255],
      [50, 255, 200],
    ])
    expect(countInkPixels(mat, INK_DARK_THRESHOLD)).toBe(3)
  })

  it('vereist minimaal 12 inkt-pixels voor matching', () => {
    const sparse = mockMat([
      [255, 100],
      [255, 255],
    ])
    const dense = mockMat(Array.from({ length: 4 }, () => Array(4).fill(100)))
    expect(hasEnoughInkPixels(sparse)).toBe(false)
    expect(hasEnoughInkPixels(dense)).toBe(true)
  })
})
