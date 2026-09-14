import { describe, expect, it } from 'vitest'
import { applyElevationWallEndAlongPlanAxis } from '@/core/plan/elevation-wall-end-edit'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import { assignWallsToGroup, createFacadeGroup } from '@/core/plan/facade-groups'
import { projectFacadeElevation } from '@/core/plan/facade-elevation'
import { makeRoofSurface, setRidgeSurfacesOnFloor } from '@/core/plan/roof-planes'
import type { Wall } from '@/core/plan/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

function attachDormer(plan: ReturnType<typeof createEmptyFloorPlan>) {
  plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
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
    makeRoofSurface({
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
    }),
  ])
}

describe('applyElevationWallEndAlongPlanAxis', () => {
  it('wang-lengte langs as, ander eind vast, geen rotatie', () => {
    const plan = createEmptyFloorPlan({ name: 'Kapel', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('side', { x: 0, y: 0 }, { x: 0, y: 400 }),
      wall('wang-l', { x: 100, y: 0 }, { x: 100, y: 80 }),
    ]
    attachDormer(plan)
    const group = createFacadeGroup(plan, { name: 'Links' })
    assignWallsToGroup(plan, group.id, ['side'])
    const elev = projectFacadeElevation(plan, group.id)!
    const wang = plan.floors[0].walls.find((item) => item.id === 'wang-l')!
    const alongB =
      (wang.b.x - elev.origin.x) * elev.axis.x + (wang.b.y - elev.origin.y) * elev.axis.y
    const alongA =
      (wang.a.x - elev.origin.x) * elev.axis.x + (wang.a.y - elev.origin.y) * elev.axis.y
    const next = applyElevationWallEndAlongPlanAxis({
      plan,
      elevation: elev,
      floorIndex: 0,
      wallId: 'wang-l',
      end: 'b',
      alongCm: alongB + (alongB - alongA),
      zCm: 320,
    })
    const moved = next.floors[0].walls.find((item) => item.id === 'wang-l')!
    expect(moved.a).toEqual({ x: 100, y: 0 })
    expect(moved.b.x).toBeCloseTo(100, 5)
    expect(moved.b.y).toBeGreaterThan(80)
    expect(moved.b.y).toBeLessThanOrEqual(128)
  })

  it('sleep voorbij de dormer-rand blijft op de rand', () => {
    const plan = createEmptyFloorPlan({ name: 'Kapel', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('side', { x: 0, y: 0 }, { x: 0, y: 400 }),
      wall('wang-l', { x: 100, y: 0 }, { x: 100, y: 120 }),
    ]
    attachDormer(plan)
    const group = createFacadeGroup(plan, { name: 'Links' })
    assignWallsToGroup(plan, group.id, ['side'])
    const elev = projectFacadeElevation(plan, group.id)!
    const next = applyElevationWallEndAlongPlanAxis({
      plan,
      elevation: elev,
      floorIndex: 0,
      wallId: 'wang-l',
      end: 'b',
      alongCm: 10_000,
      zCm: 320,
    })
    const moved = next.floors[0].walls.find((item) => item.id === 'wang-l')!
    expect(moved.b.y).toBeLessThanOrEqual(128)
    expect(moved.a).toEqual({ x: 100, y: 0 })
    expect(moved.b.x).toBeCloseTo(100, 5)
  })
})
