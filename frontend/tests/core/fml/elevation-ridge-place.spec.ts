import { describe, expect, it } from 'vitest'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { assignWallsToGroup, createFacadeGroup } from '@/core/fml/facade-groups'
import { projectFacadeElevation } from '@/core/fml/facade-elevation'
import { floorWallBaseWorldZ } from '@/core/fml/floor-stack'
import {
  placeRidgeFromElevation,
  previewRidgeFromElevation,
  resolveElevationRidgeFloor,
  spanElevationRidgeOnFloor,
} from '@/core/fml/elevation-ridge-place'
import {
  listRidgeWallsOnFloor,
  ridgeEndpointZCm,
  ridgeDisplayWidthCm,
} from '@/core/fml/ridge-walls'
import type { Wall } from '@/core/fml/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

/** Voetafdruk diepte 400 (X) × gevelbreedte 800 (Y); kopse gevel op x=0. */
function rectKopsePlan(wallHeightCm = 280) {
  const plan = createEmptyFloorPlan({ name: 'Kopse', wallHeightCm })
  plan.floors[0].walls = [
    wall('gable', { x: 0, y: 0 }, { x: 0, y: 800 }),
    wall('back', { x: 400, y: 0 }, { x: 400, y: 800 }),
    wall('s0', { x: 0, y: 0 }, { x: 400, y: 0 }),
    wall('s1', { x: 0, y: 800 }, { x: 400, y: 800 }),
  ]
  const group = createFacadeGroup(plan, { name: 'Kopgevel' })
  assignWallsToGroup(plan, group.id, ['gable'])
  return { plan, groupId: group.id }
}

describe('elevation-ridge-place', () => {
  it('plaatst nok buitenface→buitenface (~400 cm) op floor 0 met Z uit klik', () => {
    const { plan, groupId } = rectKopsePlan(280)
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xMid = (gable.xa + gable.xb) / 2
    // Hart van de nok iets boven de verdiepingshoogte (geveltop ≈ 280).
    const clickY = -(floorWallBaseWorldZ(plan, 0) + 300)
    const preview = previewRidgeFromElevation(plan, elev, { x: xMid, y: clickY })
    expect(preview).not.toBeNull()
    expect(preview!.floorIndex).toBe(0)
    const len = Math.hypot(preview!.b.x - preview!.a.x, preview!.b.y - preview!.a.y)
    expect(len).toBeGreaterThan(390)
    expect(len).toBeLessThan(430)

    const result = placeRidgeFromElevation(plan, elev, { x: xMid, y: clickY })
    expect(result).not.toBeNull()
    const ridges = listRidgeWallsOnFloor(result!.plan.floors[0])
    expect(ridges).toHaveLength(1)
    expect(ridges[0].id).toBe(result!.wallId)
    expect(ridgeEndpointZCm(ridges[0], 'a', 280)).toBe(preview!.zCm)
    expect(Math.abs(ridges[0].a.y - ridges[0].b.y)).toBeLessThan(1)
    expect(Math.abs(ridges[0].a.x - ridges[0].b.x)).toBeGreaterThan(390)
  })

  it('aanbouw: lengte stopt vóór hogere main-floor', () => {
    const plan = createEmptyFloorPlan({ name: 'Aanbouw', wallHeightCm: 280 })
    // bg: main 0..800 + aanbouw 800..1200 (diepte Y)
    plan.floors[0].walls = [
      wall('g0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('g1', { x: 800, y: 0 }, { x: 800, y: 600 }),
      wall('g2', { x: 800, y: 600 }, { x: 0, y: 600 }),
      wall('g3', { x: 0, y: 600 }, { x: 0, y: 0 }),
      wall('a0', { x: 800, y: 0 }, { x: 1200, y: 0 }),
      wall('a1', { x: 1200, y: 0 }, { x: 1200, y: 600 }),
      wall('a2', { x: 1200, y: 600 }, { x: 800, y: 600 }),
    ]
    const upper = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 280 })
    upper.walls = [
      wall('u0', { x: 0, y: 0 }, { x: 800, y: 0 }),
      wall('u1', { x: 800, y: 0 }, { x: 800, y: 600 }),
      wall('u2', { x: 800, y: 600 }, { x: 0, y: 600 }),
      wall('u3', { x: 0, y: 600 }, { x: 0, y: 0 }),
    ]
    plan.floors.push(upper)
    // Kopse van de aanbouw (rechtergevel)
    const group = createFacadeGroup(plan, { name: 'Aanbouw-kop' })
    assignWallsToGroup(plan, group.id, ['a1'])
    const elev = projectFacadeElevation(plan, group.id)!
    const gable = elev.walls.find((item) => item.wallId === 'a1' && item.floorIndex === 0)!
    const xMid = (gable.xa + gable.xb) / 2
    const clickY = -(floorWallBaseWorldZ(plan, 0) + 300)
    const floorIndex = resolveElevationRidgeFloor(plan, elev, { x: xMid, y: clickY })
    expect(floorIndex).toBe(0)
    const span = spanElevationRidgeOnFloor(plan, 0, elev, xMid)!
    const len = Math.hypot(span.b.x - span.a.x, span.b.y - span.a.y)
    // Alleen aanbouw (~400), niet door main (~1200).
    expect(len).toBeGreaterThan(350)
    expect(len).toBeLessThan(450)
    const midX = (span.a.x + span.b.x) / 2
    expect(midX).toBeGreaterThan(800)
  })

  it('twee verdiepingen opzelfde X: klik boven 1e → floor 1', () => {
    const { plan, groupId } = rectKopsePlan(280)
    const upper = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 280 })
    upper.walls = plan.floors[0].walls.map((w) => ({
      ...w,
      id: `u-${w.id}`,
      a: { ...w.a },
      b: { ...w.b },
    }))
    plan.floors.push(upper)
    assignWallsToGroup(plan, groupId, ['gable', 'u-gable'])
    const elev = projectFacadeElevation(plan, groupId)!
    const upperGable = elev.walls.find((item) => item.wallId === 'u-gable')!
    const xMid = (upperGable.xa + upperGable.xb) / 2
    const base1 = floorWallBaseWorldZ(plan, 1)
    const clickY = -(base1 + 200)
    expect(resolveElevationRidgeFloor(plan, elev, { x: xMid, y: clickY })).toBe(1)
    const result = placeRidgeFromElevation(plan, elev, { x: xMid, y: clickY })
    expect(result?.floorIndex).toBe(1)
    expect(listRidgeWallsOnFloor(result!.plan.floors[1])).toHaveLength(1)
    expect(listRidgeWallsOnFloor(result!.plan.floors[0])).toHaveLength(0)
  })

  it('klik naast het gebouw → null', () => {
    const { plan, groupId } = rectKopsePlan()
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xOutside = Math.max(gable.x0, gable.x1) + 200
    const clickY = -(floorWallBaseWorldZ(plan, 0) + 300)
    expect(previewRidgeFromElevation(plan, elev, { x: xOutside, y: clickY })).toBeNull()
    expect(placeRidgeFromElevation(plan, elev, { x: xOutside, y: clickY })).toBeNull()
  })

  it('ghost-rect gebruikt displayWidth en nokdikte', () => {
    const { plan, groupId } = rectKopsePlan()
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xMid = (gable.xa + gable.xb) / 2
    const clickY = -(floorWallBaseWorldZ(plan, 0) + 300)
    const preview = previewRidgeFromElevation(plan, elev, { x: xMid, y: clickY })!
    expect(Math.abs(preview.rect.x1 - preview.rect.x0)).toBeCloseTo(ridgeDisplayWidthCm(plan), 0)
    expect(Math.abs(preview.rect.y1 - preview.rect.y0)).toBe(preview.spanCm)
  })
})
