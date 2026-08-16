import { describe, expect, it } from 'vitest'
import { floorplannerLeftNormal } from '@/core/fml/fml-wall-geom'

describe('floorplannerLeftNormal', () => {
  it('is visual left in Y-down for each cardinal a→b', () => {
    const cases: Array<{ dir: { x: number; y: number }; left: { x: number; y: number } }> = [
      { dir: { x: 1, y: 0 }, left: { x: 0, y: -1 } },
      { dir: { x: -1, y: 0 }, left: { x: 0, y: 1 } },
      { dir: { x: 0, y: 1 }, left: { x: 1, y: 0 } },
      { dir: { x: 0, y: -1 }, left: { x: -1, y: 0 } },
    ]
    for (const { dir, left } of cases) {
      const n = floorplannerLeftNormal(dir)
      expect(n.x).toBeCloseTo(left.x, 9)
      expect(n.y).toBeCloseTo(left.y, 9)
    }
  })

  it('is the opposite of the door swing right-normal', () => {
    const dir = { x: 1, y: 0 }
    const left = floorplannerLeftNormal(dir)
    const right = { x: -dir.y, y: dir.x }
    expect(left.x).toBeCloseTo(-right.x, 9)
    expect(left.y).toBeCloseTo(-right.y, 9)
  })
})
