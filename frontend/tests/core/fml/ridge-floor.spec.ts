import { describe, expect, it } from 'vitest'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  findFloorIndexForRidgeWall,
  isPointSkyExposedOnFloor,
  listBlockedRoofRings,
  listDakSnapWalls,
  moveRidgeWallsToFloor,
  resolveFloorIndexForRidgeSegment,
} from '@/core/fml/ridge-floor'
import { markWallAsRidge, setRidgeWallsOnFloor } from '@/core/fml/ridge-walls'
import type { Wall } from '@/core/fml/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
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
