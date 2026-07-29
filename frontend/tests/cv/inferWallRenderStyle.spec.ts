import { describe, expect, it } from 'vitest'
import { inferWallRenderStyle } from '@/cv/lbe/infer-wall-render-style'
import type { ExampleSample } from '@/core/extraction'

function mockMat(cols: number, rows: number, isDark: (x: number, y: number) => boolean) {
  return {
    cols,
    rows,
    ucharPtr: (y: number, x: number) => new Uint8Array([isDark(x, y) ? 0 : 255]),
  }
}

function wallSample(bbox: { x: number; y: number; width: number; height: number }): ExampleSample {
  return { id: 'w1', type: 'wall', bbox }
}

function parallelLinesMat(
  cols: number,
  rows: number,
  lineYs: number[],
  xFrom = 10,
  xTo = 200,
  halfWidth = 1,
) {
  return mockMat(cols, rows, (x, y) => {
    if (x < xFrom || x > xTo) return false
    return lineYs.some((cy) => y >= cy - halfWidth && y <= cy + halfWidth)
  })
}

describe('inferWallRenderStyle', () => {
  it('detecteert parallel_lines bij twee parallelle lijnen', () => {
    const mat = parallelLinesMat(220, 80, [30, 48])
    const result = inferWallRenderStyle(mat, wallSample({ x: 0, y: 20, width: 210, height: 40 }))

    expect(result.renderStyle).toBe('parallel_lines')
    expect(result.parallelLineCount).toBe(2)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('detecteert parallel_lines met lijntelling bij vijf parallelle lijnen', () => {
    const mat = parallelLinesMat(220, 100, [18, 28, 38, 48, 58])
    const result = inferWallRenderStyle(mat, wallSample({ x: 0, y: 10, width: 210, height: 60 }))

    expect(result.renderStyle).toBe('parallel_lines')
    expect(result.parallelLineCount).toBeGreaterThanOrEqual(4)
  })

  it('detecteert solid bij massieve band', () => {
    const mat = mockMat(220, 80, (x, y) => y >= 24 && y <= 54 && x >= 10 && x <= 200)
    const result = inferWallRenderStyle(mat, wallSample({ x: 0, y: 10, width: 210, height: 60 }))

    expect(result.renderStyle).toBe('solid')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('detecteert details bij arcering-strepen', () => {
    const mat = mockMat(160, 80, (x, y) => {
      if (y < 20 || y > 60 || x < 10 || x > 140) return false
      return (x + y) % 8 < 3
    })
    const result = inferWallRenderStyle(mat, wallSample({ x: 0, y: 10, width: 150, height: 60 }))

    expect(result.renderStyle).toBe('details')
    expect(result.confidence).toBeGreaterThan(0.4)
  })

  it('gebruikt tekeningprofiel-prior bij twijfel', () => {
    const mat = parallelLinesMat(220, 80, [31, 47], 10, 200, 0)
    const neutral = inferWallRenderStyle(mat, wallSample({ x: 0, y: 20, width: 210, height: 40 }))
    const withPrior = inferWallRenderStyle(
      mat,
      wallSample({ x: 0, y: 20, width: 210, height: 40 }),
      {
        expectedWallStyles: ['parallel_lines'],
      },
    )

    expect(withPrior.scores.parallel_lines).toBeGreaterThanOrEqual(neutral.scores.parallel_lines)
  })
})
