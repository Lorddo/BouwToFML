import { describe, expect, it } from 'vitest'
import type { Wall } from '@/core/fml/types'
import {
  fixtureAabbHalfExtents,
  snapFixtureCenterToWallFaces,
  WALL_FACE_SNAP_CM,
} from '@/ui/components/fml-preview-fixture-face-snap'

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

describe('fixtureAabbHalfExtents', () => {
  it('unrotated box uses half width/height', () => {
    expect(fixtureAabbHalfExtents(60, 40, 0)).toEqual({ hx: 30, hy: 20 })
  })

  it('90° swaps the axes', () => {
    const ext = fixtureAabbHalfExtents(60, 40, 90)
    expect(ext.hx).toBeCloseTo(20)
    expect(ext.hy).toBeCloseTo(30)
  })
})

describe('snapFixtureCenterToWallFaces', () => {
  it('snaps a box flush to a horizontal face, not the center onto the face', () => {
    const walls = [wall({ a: { x: 0, y: 20 }, b: { x: 200, y: 20 }, thickness: 20 })]
    // Face at y=10; box hy=20 → flush center y=30
    const snapped = snapFixtureCenterToWallFaces(
      walls,
      { x: 80, y: 28 },
      { width: 60, height: 40 },
      WALL_FACE_SNAP_CM,
    )
    expect(snapped.x).toBe(80)
    expect(snapped.y).toBeCloseTo(30)
    expect(snapped.y).not.toBeCloseTo(10)
  })

  it('snaps a box flush to a vertical face', () => {
    const walls = [wall({ a: { x: 40, y: 0 }, b: { x: 40, y: 200 }, thickness: 20 })]
    // Face at x=50; box hx=30 → flush center x=80
    const snapped = snapFixtureCenterToWallFaces(
      walls,
      { x: 72, y: 90 },
      { width: 60, height: 40 },
      WALL_FACE_SNAP_CM,
    )
    expect(snapped.x).toBeCloseTo(80)
    expect(snapped.y).toBe(90)
    expect(snapped.x).not.toBeCloseTo(50)
  })

  it('L-hoek: beide zijden flush (onafhankelijke X/Y)', () => {
    const walls = [
      wall({ id: 'h', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20 }),
      wall({ id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 200 }, thickness: 20 }),
    ]
    // Buitenfaces y=-10 en x=-10; hy=20 hx=30 → center (-40, -30)
    const snapped = snapFixtureCenterToWallFaces(
      walls,
      { x: -36, y: -26 },
      { width: 60, height: 40 },
      WALL_FACE_SNAP_CM,
    )
    expect(snapped.x).toBeCloseTo(-40)
    expect(snapped.y).toBeCloseTo(-30)
  })

  it('Ctrl/disabled laat het midden vrij', () => {
    const walls = [wall({ a: { x: 0, y: 20 }, b: { x: 200, y: 20 }, thickness: 20 })]
    const point = { x: 80, y: 28 }
    expect(
      snapFixtureCenterToWallFaces(walls, point, { width: 60, height: 40 }, WALL_FACE_SNAP_CM, {
        disabled: true,
      }),
    ).toEqual(point)
  })
})
