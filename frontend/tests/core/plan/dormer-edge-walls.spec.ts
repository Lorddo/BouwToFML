import { describe, expect, it } from 'vitest'
import {
  findDormerEdgeSurface,
  flushDormerEdgeWallOutward,
  flushKopseDormerWalls,
  isWallOnDormerEdge,
  clampDormerEndT,
} from '@/core/plan/dormer-edge-walls'
import { makeRoofSurface } from '@/core/plan/roof-planes'
import { wallFaces } from '@/core/plan/plan-wall-geom'
import type { Wall } from '@/core/plan/types'

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
    expect((a.balance ?? 0) + (b.balance ?? 0)).toBe(1)
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

  it('flush kopse: wang-hoek blijft aan de voorkant gekoppeld', () => {
    const roof = dormer()
    const surfaces = [
      makeRoofSurface({
        id: 'parent',
        origin: 'manual',
        poly: [
          { x: 0, y: 0, z: 280 },
          { x: 400, y: 0, z: 280 },
          { x: 400, y: 400, z: 400 },
          { x: 0, y: 400, z: 400 },
        ],
      }),
      roof,
    ]
    const kopse = wall('front', { x: 100, y: 0 }, { x: 250, y: 0 })
    const wang = wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 })
    const { walls, flushed } = flushKopseDormerWalls([kopse, wang], surfaces)
    expect(flushed).toBe(1)
    const nextKopse = walls.find((item) => item.id === 'front')!
    const nextWang = walls.find((item) => item.id === 'wang')!
    expect(nextKopse.balance === 0 || nextKopse.balance === 1).toBe(true)
    expect(nextWang.balance).toBe(0.5)
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y)
    const welded =
      dist(nextKopse.a, nextWang.a) < 0.2 ||
      dist(nextKopse.a, nextWang.b) < 0.2 ||
      dist(nextKopse.b, nextWang.a) < 0.2 ||
      dist(nextKopse.b, nextWang.b) < 0.2
    expect(welded).toBe(true)
    expect(nextWang.a.x).toBeCloseTo(nextWang.b.x, 5)
    expect(nextKopse.a.y).toBeCloseTo(nextKopse.b.y, 5)
  })

  it('flush kopse: wang op ½ dikte-offset blijft gelast', () => {
    const roof = dormer()
    const surfaces = [
      makeRoofSurface({
        id: 'parent',
        origin: 'manual',
        poly: [
          { x: 0, y: 0, z: 280 },
          { x: 400, y: 0, z: 280 },
          { x: 400, y: 400, z: 400 },
          { x: 0, y: 400, z: 400 },
        ],
      }),
      roof,
    ]
    const kopse = wall('front', { x: 100, y: 0 }, { x: 250, y: 0 }, 0.5)
    kopse.thickness = 10
    const wang = wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 }, 0.5)
    wang.thickness = 10
    const already = flushDormerEdgeWallOutward(kopse, roof)
    expect(already.balance === 0 || already.balance === 1).toBe(true)
    const gap = Math.hypot(already.a.x - wang.a.x, already.a.y - wang.a.y)
    expect(gap).toBeGreaterThan(4)
    const { walls } = flushKopseDormerWalls([already, wang], surfaces)
    const nextKopse = walls.find((item) => item.id === 'front')!
    const nextWang = walls.find((item) => item.id === 'wang')!
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y)
    const welded =
      dist(nextKopse.a, nextWang.a) < 0.2 ||
      dist(nextKopse.a, nextWang.b) < 0.2 ||
      dist(nextKopse.b, nextWang.a) < 0.2 ||
      dist(nextKopse.b, nextWang.b) < 0.2
    expect(welded).toBe(true)
    expect(nextWang.balance).toBe(0.5)
    expect(nextWang.a.x).toBeCloseTo(nextWang.b.x, 5)
    expect(nextKopse.a.y).toBeCloseTo(nextKopse.b.y, 5)
  })
})
