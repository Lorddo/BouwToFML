import { describe, expect, it } from 'vitest'
import {
  findWallsFullyInCmBBox,
  normalizeCmBBox,
  wallCmBBox,
} from '@/ui/composables/fml-preview/fml-preview-wall-select'

describe('normalizeCmBBox', () => {
  it('normaliseert signed drag (bottom→top / right→left) naar positieve size', () => {
    expect(normalizeCmBBox({ x: 100, y: 80, width: -60, height: -40 })).toEqual({
      x: 40,
      y: 40,
      width: 60,
      height: 40,
    })
    expect(normalizeCmBBox({ x: 40, y: 40, width: 60, height: 40 })).toEqual({
      x: 40,
      y: 40,
      width: 60,
      height: 40,
    })
  })
})

describe('findWallsFullyInCmBBox', () => {
  const walls = [
    { id: 'w1', a: { x: 10, y: 10 }, b: { x: 90, y: 10 }, thickness: 20, openings: [] },
    { id: 'w2', a: { x: 10, y: 50 }, b: { x: 90, y: 50 }, thickness: 20, openings: [] },
    { id: 'w3', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, openings: [] },
  ]

  it('selecteert alleen muren volledig binnen bbox', () => {
    expect(findWallsFullyInCmBBox(walls, { x: 0, y: 0, width: 100, height: 30 })).toEqual(['w1'])
    expect(findWallsFullyInCmBBox(walls, { x: 0, y: 0, width: 100, height: 70 })).toEqual(['w1', 'w2'])
    expect(findWallsFullyInCmBBox(walls, { x: 20, y: 0, width: 60, height: 30 })).toEqual([])
  })

  it('selecteert hetzelfde bij signed bbox (bottom→top drag)', () => {
    expect(findWallsFullyInCmBBox(walls, { x: 100, y: 30, width: -100, height: -30 })).toEqual([
      'w1',
    ])
  })

  it('houdt rekening met muurdikte in bbox', () => {
    const bbox = wallCmBBox(walls[0]!)
    expect(findWallsFullyInCmBBox(walls, bbox)).toEqual(['w1'])
    expect(
      findWallsFullyInCmBBox(walls, {
        x: bbox.x + 1,
        y: bbox.y + 1,
        width: bbox.width - 2,
        height: bbox.height - 2,
      }),
    ).toEqual([])
  })
})
