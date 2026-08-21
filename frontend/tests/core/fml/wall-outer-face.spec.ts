import { describe, expect, it } from 'vitest'
import {
  OUTER_FACE_SNAP_CM,
  snapPointToOuterWallFaces,
  wallOuterFace,
} from '@/core/fml/wall-outer-face'
import type { Wall } from '@/core/fml/types'

function wall(partial: Partial<Wall> & Pick<Wall, 'a' | 'b' | 'thickness'>): Wall {
  return {
    id: partial.id ?? 'w',
    a: partial.a,
    b: partial.b,
    thickness: partial.thickness,
    balance: partial.balance,
    openings: [],
  }
}

const centroid = { x: 50, y: 50 }

describe('snapPointToOuterWallFaces', () => {
  const box = [
    wall({ id: 's', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20 }),
    wall({ id: 'e', a: { x: 100, y: 0 }, b: { x: 100, y: 100 }, thickness: 20 }),
    wall({ id: 'n', a: { x: 100, y: 100 }, b: { x: 0, y: 100 }, thickness: 20 }),
    wall({ id: 'w', a: { x: 0, y: 100 }, b: { x: 0, y: 0 }, thickness: 20 }),
  ]

  it('L-hoek: twee buitenfaces, niet face-eind op de hartlijn', () => {
    const snapped = snapPointToOuterWallFaces(box, centroid, { x: 2, y: -3 }, OUTER_FACE_SNAP_CM)
    expect(snapped.x).toBeCloseTo(-10)
    expect(snapped.y).toBeCloseTo(-10)
    expect(snapped).not.toEqual({ x: 0, y: -10 })
    expect(snapped).not.toEqual({ x: 2, y: -10 })
  })

  it('midden op de goot blijft op die buitenface', () => {
    const snapped = snapPointToOuterWallFaces(box, centroid, { x: 50, y: -4 }, OUTER_FACE_SNAP_CM)
    expect(snapped.x).toBeCloseTo(50)
    expect(snapped.y).toBeCloseTo(-10)
  })

  it('flush-balance: hoek is volle dikte buiten, niet hartlijn-face', () => {
    const flush = [
      wall({ id: 's', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 20, balance: 1 }),
      wall({ id: 'w', a: { x: 0, y: 100 }, b: { x: 0, y: 0 }, thickness: 20, balance: 1 }),
    ]
    const south = wallOuterFace(flush[0], centroid)
    const west = wallOuterFace(flush[1], centroid)
    expect(south.a.y).toBeCloseTo(-20)
    expect(west.a.x).toBeCloseTo(-20)

    const snapped = snapPointToOuterWallFaces(flush, centroid, { x: 1, y: -18 }, OUTER_FACE_SNAP_CM)
    expect(snapped.x).toBeCloseTo(-20)
    expect(snapped.y).toBeCloseTo(-20)
    expect(snapped).not.toEqual({ x: 0, y: -20 })
  })

  it('ver van faces blijft vrij', () => {
    const point = { x: 50, y: 50 }
    expect(snapPointToOuterWallFaces(box, centroid, point, OUTER_FACE_SNAP_CM)).toEqual(point)
  })
})
