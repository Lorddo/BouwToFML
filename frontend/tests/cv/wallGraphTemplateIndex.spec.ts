import { describe, expect, it } from 'vitest'
import { buildWallGraph } from '@/cv/port/wallGraph'

describe('buildWallGraph templateIndex', () => {
  it('behoudt templateIndex na snap en merge', () => {
    const segments = buildWallGraph(
      [
        { a: { x: 100, y: 50 }, b: { x: 200, y: 52 }, templateIndex: 1 },
        { a: { x: 198, y: 51 }, b: { x: 280, y: 49 }, templateIndex: 1 },
      ],
      { minLengthPx: 8, snapRadiusPx: 12, angleToleranceDeg: 12 },
    )
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.every((seg) => seg.templateIndex === 1)).toBe(true)
  })
})
