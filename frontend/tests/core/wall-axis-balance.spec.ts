import { describe, expect, it } from 'vitest'
import {
  centerlineFromAxis,
  offsetWallAxis,
  wallFaces,
  wallVisualMid,
} from '@/core/fml/fml-wall-geom'
import {
  rebasePlanSnap,
  setBalanceKeepingFaces,
  setWallsBalanceKeepingFaces,
  setWallsThicknessKeepingFaces,
} from '@/core/fml/wall-axis-balance'
import type { FloorPlan, Wall } from '@/core/fml/types'
import { buildWallRenderGeometry } from '@/ui/components/fml-preview-wall-polygons'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness: number,
  balance = 0.5,
): Wall {
  return { id, a, b, thickness, balance, c: null, openings: [] }
}

/** Klant-achtige 15/30-rechthoek op hartlijn (Ground floor uit test snap point). */
function groundFloorRect(): Wall[] {
  return [
    wall('132558', { x: 400, y: -515 }, { x: 0, y: -515 }, 30, 0.5), // onder
    wall('34dbe8', { x: 0, y: -515 }, { x: 0, y: 0 }, 15, 0.5), // links
    wall('02dda5', { x: 400, y: 0 }, { x: 400, y: -515 }, 15, 0.5), // rechts
    wall('a27c0a', { x: 0, y: 0 }, { x: 400, y: 0 }, 30, 0.5), // boven
  ]
}

function bodyFillPoints(walls: Wall[]) {
  return buildWallRenderGeometry(walls).fillComponents.flatMap((c) => c.rings.flat())
}

function maxPointDistance(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
): number {
  let max = 0
  for (const p of a) {
    let best = Infinity
    for (const q of b) {
      best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y))
    }
    max = Math.max(max, best)
  }
  return max
}

describe('fml-wall-geom keep-faces primitives', () => {
  it('wallVisualMid is offset from axis by (B−0.5)·t along left normal', () => {
    const w = wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 20, 0.8)
    // a→b +X, left = −Y; mid = 20*(0.8-0.5)=6 toward −Y
    const mid = wallVisualMid(w, 0.5)
    expect(mid.x).toBeCloseTo(50, 6)
    expect(mid.y).toBeCloseTo(-6, 6)
    expect(centerlineFromAxis(w, 0.5)).toEqual(mid)
  })

  it('wallFaces at B=0.5 span ±t/2; at B=0 axis is left face', () => {
    const centered = wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 30, 0.5)
    const faces = wallFaces(centered)
    expect(faces.left.a.y).toBeCloseTo(-15, 6)
    expect(faces.right.a.y).toBeCloseTo(15, 6)

    const flush = offsetWallAxis(centered, 0.5, 0)
    expect(flush.a.y).toBeCloseTo(-15, 6)
    expect(flush.b.y).toBeCloseTo(-15, 6)
    const flushFaces = wallFaces(flush)
    expect(flushFaces.left.a.y).toBeCloseTo(-15, 6)
    expect(flushFaces.right.a.y).toBeCloseTo(15, 6)
  })

  it('offsetWallAxis 0.5→1 moves axis to outer face', () => {
    const centered = wall('h', { x: 0, y: 0 }, { x: 100, y: 0 }, 30, 0.5)
    const outer = offsetWallAxis(centered, 0.5, 1)
    expect(outer.balance).toBe(1)
    expect(outer.a.y).toBeCloseTo(15, 6)
    const faces = wallFaces(outer)
    expect(faces.left.a.y).toBeCloseTo(-15, 6)
    expect(faces.right.a.y).toBeCloseTo(15, 6)
  })
})

describe('setWallsBalanceKeepingFaces', () => {
  it('shifts a single wall axis 0.5→0 without changing body faces', () => {
    const before = wall('w', { x: 0, y: 0 }, { x: 100, y: 0 }, 20, 0.5)
    const after = setBalanceKeepingFaces(before, 0)
    expect(after.balance).toBe(0)
    expect(after.a.y).toBeCloseTo(-10, 6)
    expect(after.b.y).toBeCloseTo(-10, 6)
    const beforeFaces = wallFaces(before)
    const afterFaces = wallFaces(after)
    expect(afterFaces.left.a.y).toBeCloseTo(beforeFaces.left.a.y, 6)
    expect(afterFaces.right.a.y).toBeCloseTo(beforeFaces.right.a.y, 6)
  })

  it('reprojects openings along the new axis', () => {
    const before: Wall = {
      id: 'w',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      thickness: 20,
      balance: 0.5,
      c: null,
      openings: [{ refid: 'd', t: 0.4, width: 90, type: 'door' }],
    }
    const after = setBalanceKeepingFaces(before, 0)
    // Opening world center was (40,0); new axis at y=-10 → still t=0.4
    expect(after.openings[0]?.t).toBeCloseTo(0.4, 6)
    expect(after.a.y).toBeCloseTo(-10, 6)
  })

  it('stitches 15/30 rectangle junctions for B=0 and B=1 (body invariant)', () => {
    const ground = groundFloorRect()
    const body0 = bodyFillPoints(ground)

    const ids = ground.map((w) => w.id)
    const inner = setWallsBalanceKeepingFaces(ground, ids, 0)
    expect(inner.every((w) => w.balance === 0)).toBe(true)

    const top = inner.find((w) => w.id === 'a27c0a')!
    // Bovenmuur t=30: as op binnenface y≈−15
    expect(top.a.y).toBeCloseTo(-15, 0)
    expect(top.b.y).toBeCloseTo(-15, 0)
    // Knooppunten: x ≈ ± half side thickness (7.5)
    const xs = [top.a.x, top.b.x].sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(7.5, 0)
    expect(xs[1]).toBeCloseTo(392.5, 0)

    const bodyInner = bodyFillPoints(inner)
    expect(maxPointDistance(body0, bodyInner)).toBeLessThan(1.5)
    expect(maxPointDistance(bodyInner, body0)).toBeLessThan(1.5)

    const outer = setWallsBalanceKeepingFaces(ground, ids, 1)
    const topOuter = outer.find((w) => w.id === 'a27c0a')!
    expect(topOuter.a.y).toBeCloseTo(15, 0)
    const bodyOuter = bodyFillPoints(outer)
    expect(maxPointDistance(body0, bodyOuter)).toBeLessThan(1.5)
  })

  it('rebasePlanSnap 0.5 is no-op on centered floor; 0 and 1 keep body', () => {
    const plan: FloorPlan = {
      name: 'snap',
      floors: [{ name: 'bg', level: 0, height: 270, walls: groundFloorRect() }],
    }
    const same = rebasePlanSnap(plan, 0.5)
    expect(same.floors[0].walls[0].a).toEqual(plan.floors[0].walls[0].a)

    const to0 = rebasePlanSnap(plan, 0)
    expect(to0.floors[0].walls.every((w) => w.balance === 0)).toBe(true)
    const to1 = rebasePlanSnap(plan, 1)
    expect(to1.floors[0].walls.every((w) => w.balance === 1)).toBe(true)

    const body = bodyFillPoints(plan.floors[0].walls)
    expect(maxPointDistance(body, bodyFillPoints(to0.floors[0].walls))).toBeLessThan(1.5)
    expect(maxPointDistance(body, bodyFillPoints(to1.floors[0].walls))).toBeLessThan(1.5)
  })

  it('setWallsThicknessKeepingFaces moves face-axis to mid before thickness change', () => {
    const walls = [wall('w1', { x: 0, y: 0 }, { x: 100, y: 0 }, 20, 0)]
    // B=0: as = left face at y=0; body mid at y=+10 (right of a→b)
    const next = setWallsThicknessKeepingFaces(walls, ['w1'], 24)
    expect(next[0]?.balance).toBe(0.5)
    expect(next[0]?.thickness).toBe(24)
    expect(next[0]?.a.y).toBeCloseTo(10, 6)
    expect(next[0]?.b.y).toBeCloseTo(10, 6)
  })
})
