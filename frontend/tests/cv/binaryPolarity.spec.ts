import { describe, expect, it, vi } from 'vitest'
import {
  ensureBlackInkOnWhiteBackground,
  measureBorderWhiteRatio,
  shouldInvertBinaryPolarity,
} from '@/cv/port/binaryPolarity'

function makeBinaryMat(cols: number, rows: number, fill: 0 | 255, borderFill?: 0 | 255): {
  cols: number
  rows: number
  data: Uint8Array
} {
  const data = new Uint8Array(cols * rows)
  data.fill(fill)
  const border = borderFill ?? fill
  for (let x = 0; x < cols; x += 1) {
    data[x] = border
    data[(rows - 1) * cols + x] = border
  }
  for (let y = 0; y < rows; y += 1) {
    data[y * cols] = border
    data[y * cols + cols - 1] = border
  }
  return { cols, rows, data }
}

describe('binaryPolarity', () => {
  it('meet witte rand op normaal B/W-beeld', () => {
    const mat = makeBinaryMat(20, 20, 0, 255)
    expect(measureBorderWhiteRatio(mat.data, mat.cols, mat.rows)).toBe(1)
  })

  it('detecteert witte inkt op zwarte achtergrond', () => {
    const mat = makeBinaryMat(40, 40, 255, 0)
    expect(shouldInvertBinaryPolarity(mat.data, mat.cols, mat.rows)).toBe(true)
  })

  it('laat zwarte inkt op witte achtergrond staan', () => {
    const mat = makeBinaryMat(40, 40, 255, 255)
    mat.data[20 * 40 + 20] = 0
    expect(shouldInvertBinaryPolarity(mat.data, mat.cols, mat.rows)).toBe(false)
  })

  it('draait polariteit om via ensureBlackInkOnWhiteBackground', () => {
    const mat = makeBinaryMat(30, 30, 255, 0)
    const cv = { bitwise_not: vi.fn((_src, dst) => dst.data.set(mat.data.map((v) => (v < 128 ? 255 : 0)))) }
    const out = { ...mat, data: mat.data.slice() }
    ensureBlackInkOnWhiteBackground(cv as never, out as never)
    expect(cv.bitwise_not).toHaveBeenCalled()
  })
})
