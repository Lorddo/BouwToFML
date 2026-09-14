import { describe, expect, it } from 'vitest'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import {
  findFloorIndexForRidgeWall,
  holeMatchesFloorCutout,
  isPointSkyExposedOnFloor,
  listBlockedRoofRings,
  listDakSnapWalls,
  listFloorEnvelopeWalls,
  moveRidgeWallsToFloor,
  resolveFloorIndexForRidgeSegment,
} from '@/core/plan/ridge-floor'
import { markWallAsRidge, setRidgeWallsOnFloor } from '@/core/plan/ridge-walls'
import type { FloorSurface, Wall } from '@/core/plan/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

function pointInRing(
  point: { x: number; y: number },
  ring: readonly { x: number; y: number }[],
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-15) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

describe('ridge-floor', () => {
  it('plaatst op de hoogste floor die het midden raakt', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 800 }),
      wall('g2', { x: 800, y: 800 }, { x: 0, y: 800 }),
      wall('g3', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: 280 })
    upper.walls = [
      wall('u0', { x: 200, y: 200 }, { x: 600, y: 200 }),
      wall('u1', { x: 600, y: 200 }, { x: 600, y: 600 }),
      wall('u2', { x: 600, y: 600 }, { x: 200, y: 600 }),
      wall('u3', { x: 200, y: 600 }, { x: 200, y: 200 }),
    ]
    plan.floors.push(upper)

    expect(resolveFloorIndexForRidgeSegment(plan, { x: 300, y: 400 }, { x: 500, y: 400 })).toBe(1)
    expect(resolveFloorIndexForRidgeSegment(plan, { x: 40, y: 40 }, { x: 80, y: 40 })).toBe(0)
  })

  it('aanbouw buiten de bovenste omtrek blijft op de lagere floor', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 250 })
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 1000 }),
      wall('g2', { x: 800, y: 1000 }, { x: 0, y: 1000 }),
      wall('g3', { x: 0, y: 1000 }, { x: 0, y: 0 }),
    ]
    const mid = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 250 })
    mid.walls = [
      wall('m0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('m1', { x: 800, y: 0 }, { x: 800, y: 1000 }),
      wall('m2', { x: 800, y: 1000 }, { x: 0, y: 1000 }),
      wall('m3', { x: 0, y: 1000 }, { x: 0, y: 0 }),
    ]
    const upper = createBlankFloor({ name: '2e', level: 2, wallHeightCm: 250 })
    upper.walls = [
      wall('u0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('u1', { x: 800, y: 0 }, { x: 800, y: 700 }),
      wall('u2', { x: 800, y: 700 }, { x: 0, y: 700 }),
      wall('u3', { x: 0, y: 700 }, { x: 0, y: 0 }),
    ]
    plan.floors.push(mid, upper)
    expect(resolveFloorIndexForRidgeSegment(plan, { x: 100, y: 850 }, { x: 700, y: 850 })).toBe(1)
    expect(resolveFloorIndexForRidgeSegment(plan, { x: 100, y: 350 }, { x: 700, y: 350 })).toBe(2)
  })

  it('laat de gevel van de hogere floor vrij (geen slack-verbod)', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 800 }),
      wall('g2', { x: 800, y: 800 }, { x: 0, y: 800 }),
      wall('g3', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: 280 })
    upper.walls = [
      wall('u0', { x: 200, y: 200 }, { x: 600, y: 200 }),
      wall('u1', { x: 600, y: 200 }, { x: 600, y: 600 }),
      wall('u2', { x: 600, y: 600 }, { x: 200, y: 600 }),
      wall('u3', { x: 200, y: 600 }, { x: 200, y: 200 }),
    ]
    plan.floors.push(upper)

    const facadeOuter = { x: 200, y: 190 }
    expect(isPointSkyExposedOnFloor(plan, 0, facadeOuter)).toBe(true)
    expect(isPointSkyExposedOnFloor(plan, 0, { x: 400, y: 400 })).toBe(false)

    const blocked = listBlockedRoofRings(plan, 0)
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toHaveLength(4)
    const xs = blocked[0].map((point) => point.x)
    const ys = blocked[0].map((point) => point.y)
    // 20 cm muren, balance 0.5 → buitenfaces, niet hartlijn 200–600
    expect(Math.min(...xs)).toBeCloseTo(190, 4)
    expect(Math.max(...xs)).toBeCloseTo(610, 4)
    expect(Math.min(...ys)).toBeCloseTo(190, 4)
    expect(Math.max(...ys)).toBeCloseTo(610, 4)
    // Geen face-eind-knikje: hoeken liggen op het snijpunt, ribben H/V
    const onOuter = (value: number) => Math.abs(value - 190) < 1e-4 || Math.abs(value - 610) < 1e-4
    for (const point of blocked[0]) {
      expect(onOuter(point.x)).toBe(true)
      expect(onOuter(point.y)).toBe(true)
    }
    for (let i = 0; i < blocked[0].length; i += 1) {
      const a = blocked[0][i]
      const b = blocked[0][(i + 1) % blocked[0].length]
      expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(420, 4)
    }
    expect(listBlockedRoofRings(plan, 1)).toEqual([])
  })

  it('L-vorm: volgt de buitencontour, vult de inzinking niet met een convex hull', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 800 }),
      wall('g2', { x: 800, y: 800 }, { x: 0, y: 800 }),
      wall('g3', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: 280 })
    upper.walls = [
      wall('u0', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('u1', { x: 400, y: 0 }, { x: 400, y: 200 }),
      wall('u2', { x: 400, y: 200 }, { x: 200, y: 200 }),
      wall('u3', { x: 200, y: 200 }, { x: 200, y: 400 }),
      wall('u4', { x: 200, y: 400 }, { x: 0, y: 400 }),
      wall('u5', { x: 0, y: 400 }, { x: 0, y: 0 }),
    ]
    plan.floors.push(upper)

    const blocked = listBlockedRoofRings(plan, 0)
    expect(blocked).toHaveLength(1)
    const ring = blocked[0]
    expect(ring.length).toBeGreaterThanOrEqual(6)
    const xs = ring.map((point) => point.x)
    const ys = ring.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(-10, 1)
    expect(Math.max(...xs)).toBeCloseTo(410, 1)
    expect(Math.min(...ys)).toBeCloseTo(-10, 1)
    expect(Math.max(...ys)).toBeCloseTo(410, 1)

    const nearInner = ring.some(
      (point) => Math.abs(point.x - 210) < 2 && Math.abs(point.y - 210) < 2,
    )
    expect(nearInner).toBe(true)
    expect(pointInRing({ x: 300, y: 300 }, ring)).toBe(false)
    expect(pointInRing({ x: 100, y: 100 }, ring)).toBe(true)
  })

  it('T-split gevel: buitenface blijft recht, geen hartlijn-tab op het einde', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 800 }),
      wall('g2', { x: 800, y: 800 }, { x: 0, y: 800 }),
      wall('g3', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: 280 })
    upper.walls = [
      wall('u0a', { x: 200, y: 200 }, { x: 400, y: 200 }),
      wall('u0b', { x: 400, y: 200 }, { x: 600, y: 200 }),
      wall('u1', { x: 600, y: 200 }, { x: 600, y: 600 }),
      wall('u2a', { x: 600, y: 600 }, { x: 400, y: 600 }),
      wall('u2b', { x: 400, y: 600 }, { x: 200, y: 600 }),
      wall('u3', { x: 200, y: 600 }, { x: 200, y: 200 }),
      wall('in', { x: 400, y: 200 }, { x: 400, y: 600 }),
    ]
    plan.floors.push(upper)

    const blocked = listBlockedRoofRings(plan, 0)
    expect(blocked).toHaveLength(1)
    const ring = blocked[0]
    const xs = ring.map((point) => point.x)
    const ys = ring.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(190, 1)
    expect(Math.max(...xs)).toBeCloseTo(610, 1)
    expect(Math.min(...ys)).toBeCloseTo(190, 1)
    expect(Math.max(...ys)).toBeCloseTo(610, 1)
    for (const point of ring) {
      const onOuterX = Math.abs(point.x - 190) < 0.5 || Math.abs(point.x - 610) < 0.5
      const onOuterY = Math.abs(point.y - 190) < 0.5 || Math.abs(point.y - 610) < 0.5
      expect(onOuterX && onOuterY).toBe(true)
    }
    expect(
      ring.some((point) => Math.abs(point.x - 400) < 0.5 && Math.abs(point.y - 200) < 0.5),
    ).toBe(false)
  })

  it('dak-snap: gevel van de floor erboven, geen binnenwand', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 800 }),
      wall('g2', { x: 800, y: 800 }, { x: 0, y: 800 }),
      wall('g3', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: 280 })
    upper.walls = [
      wall('u0', { x: 200, y: 200 }, { x: 600, y: 200 }),
      wall('u1', { x: 600, y: 200 }, { x: 600, y: 600 }),
      wall('u2', { x: 600, y: 600 }, { x: 200, y: 600 }),
      wall('u3', { x: 200, y: 600 }, { x: 200, y: 200 }),
      wall('in', { x: 300, y: 400 }, { x: 500, y: 400 }),
    ]
    plan.floors.push(upper)

    const ids = listDakSnapWalls(plan, 0).map((item) => item.id)
    expect(ids).toContain('u0')
    expect(ids).not.toContain('in')
  })

  it('trapgat is geen dak-gat: dichte vloerplaat + geen gevel van cutout-wanden', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 800 }),
      wall('g2', { x: 800, y: 800 }, { x: 0, y: 800 }),
      wall('g3', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: 280 })
    upper.walls = [
      wall('u0', { x: 200, y: 200 }, { x: 600, y: 200 }),
      wall('u1', { x: 600, y: 200 }, { x: 600, y: 600 }),
      wall('u2', { x: 600, y: 600 }, { x: 200, y: 600 }),
      wall('u3', { x: 200, y: 600 }, { x: 200, y: 200 }),
      wall('t0', { x: 420, y: 420 }, { x: 500, y: 420 }),
      wall('t1', { x: 500, y: 420 }, { x: 500, y: 500 }),
      wall('t2', { x: 500, y: 500 }, { x: 420, y: 500 }),
      wall('t3', { x: 420, y: 500 }, { x: 420, y: 420 }),
    ]
    upper.areas = [
      {
        id: 'room',
        poly: [
          { x: 210, y: 210 },
          { x: 590, y: 210 },
          { x: 590, y: 590 },
          { x: 210, y: 590 },
        ],
        color: '#eee',
        showAreaLabel: true,
      },
    ]
    const trapgat: FloorSurface = {
      id: 'cut',
      poly: [
        { x: 425, y: 425 },
        { x: 495, y: 425 },
        { x: 495, y: 495 },
        { x: 425, y: 495 },
      ],
      color: '#fff',
      showAreaLabel: true,
      customName: 'Trapgat',
      isCutout: true,
    }
    upper.surfaces = [trapgat]
    plan.floors.push(upper)

    const trapCenter = { x: 460, y: 460 }
    expect(isPointSkyExposedOnFloor(plan, 0, trapCenter)).toBe(false)
    expect(isPointSkyExposedOnFloor(plan, 0, { x: 400, y: 400 })).toBe(false)

    const blocked = listBlockedRoofRings(plan, 0)
    expect(blocked).toHaveLength(1)
    const xs = blocked[0].map((point) => point.x)
    const ys = blocked[0].map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(190, 4)
    expect(Math.max(...xs)).toBeCloseTo(610, 4)
    expect(Math.min(...ys)).toBeCloseTo(190, 4)
    expect(Math.max(...ys)).toBeCloseTo(610, 4)

    const envelopeIds = listFloorEnvelopeWalls(upper).map((item) => item.id)
    expect(envelopeIds).toEqual(expect.arrayContaining(['u0', 'u1', 'u2', 'u3']))
    expect(envelopeIds).not.toContain('t0')
    expect(holeMatchesFloorCutout(trapgat.poly, upper)).toBe(true)
  })

  it('verplaatst een nok naar een andere floor', () => {
    const plan = createEmptyFloorPlan({ name: 'Nok', wallHeightCm: 280 })
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: 280 })
    plan.floors.push(upper)
    const ridge = markWallAsRidge(wall('r1', { x: 0, y: 0 }, { x: 100, y: 0 }))
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    expect(findFloorIndexForRidgeWall(plan, 'r1')).toBe(0)
    const moved = moveRidgeWallsToFloor(plan, ['r1'], 1)
    expect(findFloorIndexForRidgeWall(moved, 'r1')).toBe(1)
  })
})
