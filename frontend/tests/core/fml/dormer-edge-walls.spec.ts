import { describe, expect, it } from 'vitest'
import {
  findDormerEdgeSurface,
  flushDormerEdgeWallOutward,
  isWallOnDormerEdge,
  clampDormerEndT,
} from '@/core/fml/dormer-edge-walls'
import { makeRoofSurface } from '@/core/fml/roof-planes'
import { wallFaces } from '@/core/fml/fml-wall-geom'
import type { Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  balance = 0.5,
): Wall {
  return { id, a, b, thickness: 20, balance, openings: [] }
}

function dormer() {
  return makeRoofSurface({
    id: 'd1',
    origin: 'manual',
    roofKind: 'dormer',
    roofParentId: 'parent',
    poly: [
      { x: 100, y: 0, z: 280 },
      { x: 250, y: 0, z: 280 },
      { x: 250, y: 120, z: 320 },
      { x: 100, y: 120, z: 320 },
    ],
  })
}

describe('dakkapel-randmuren', () => {
  const roof = dormer()

  it('voorkant en wang op de poly-rand', () => {
    expect(isWallOnDormerEdge(wall('front', { x: 100, y: 0 }, { x: 250, y: 0 }), roof)).toBe(true)
    expect(isWallOnDormerEdge(wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 }), roof)).toBe(true)
  })

  it('kamerschot in de kapel en lange gevel die de kapel raakt: nee', () => {
    expect(
      isWallOnDormerEdge(wall('split', { x: 175, y: 20 }, { x: 175, y: 100 }), roof),
    ).toBe(false)
    expect(isWallOnDormerEdge(wall('gevel', { x: 0, y: 0 }, { x: 400, y: 0 }), roof)).toBe(false)
  })

  it('flush: hartlijn op buitenface, dikte naar binnen, baksteen blijft', () => {
    const wang = wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 })
    const before = wallFaces(wang)
    const flushed = flushDormerEdgeWallOutward(wang, roof)
    expect(flushed.balance).toBe(1)
    expect(flushed.a.x).toBeCloseTo(90, 5)
    expect(flushed.b.x).toBeCloseTo(90, 5)
    const after = wallFaces(flushed)
    expect(after.right.a.x).toBeCloseTo(before.right.a.x, 5)
    expect(after.left.a.x).toBeCloseTo(before.left.a.x, 5)
    expect(findDormerEdgeSurface(wang, [roof])?.id).toBe('d1')
  })

  it('a↔b: dezelfde wereld-buitenface, 1 - balance', () => {
    const wang = wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 })
    const swapped = wall('wang', wang.b, wang.a)
    const a = flushDormerEdgeWallOutward(wang, roof)
    const b = flushDormerEdgeWallOutward(swapped, roof)
    expect(a.balance + b.balance).toBe(1)
    expect(a.a.x).toBeCloseTo(b.a.x, 5)
    expect(a.b.x).toBeCloseTo(b.b.x, 5)
  })

  it('clamp: niet voorbij de kindvlak-rand', () => {
    const wang = wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 })
    const t = clampDormerEndT({
      wall: wang,
      end: 'b',
      nextT: 3,
      coverage: { tMin: 0, tMax: 1 },
    })
    expect(t).toBeLessThanOrEqual(1)
    const alreadyOut = clampDormerEndT({
      wall: wang,
      end: 'b',
      nextT: 4,
      coverage: { tMin: 0, tMax: 0.8 },
    })
    expect(alreadyOut).toBeGreaterThanOrEqual(1)
  })
})
