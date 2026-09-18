import { describe, expect, it } from 'vitest'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import {
  findRidgeSurface,
  makeRoofSurface,
  roofSurfaceHeightCm,
  setRidgeSurfaceHeightCm,
  setRidgeSurfacesOnFloor,
} from '@/core/plan/roof-planes'

function planWithRoof(
  poly: Array<{ x: number; y: number; z: number }>,
  roofKind: 'plane' | 'dormer' = 'dormer',
) {
  const plan = createEmptyFloorPlan({ name: 'RoofZ', wallHeightCm: 280 })
  plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
    makeRoofSurface({
      id: 'roof-1',
      origin: 'manual',
      roofKind,
      poly,
    }),
  ])
  return plan
}

describe('roofSurfaceHeightCm / setRidgeSurfaceHeightCm', () => {
  it('leest de eerste hoek als vlakhoogte', () => {
    const surface = makeRoofSurface({
      id: 'd1',
      origin: 'manual',
      roofKind: 'dormer',
      poly: [
        { x: 0, y: 0, z: 300 },
        { x: 200, y: 0, z: 300 },
        { x: 200, y: 80, z: 320 },
        { x: 0, y: 80, z: 320 },
      ],
    })
    expect(roofSurfaceHeightCm(surface)).toBe(300)
  })

  it('zet alle hoeken op dezelfde getypte hoogte', () => {
    const plan = planWithRoof([
      { x: 0, y: 0, z: 300 },
      { x: 200, y: 0, z: 300 },
      { x: 200, y: 80, z: 320 },
      { x: 0, y: 80, z: 320 },
    ])
    const next = setRidgeSurfaceHeightCm(plan, 'roof-1', 340)
    const zs = findRidgeSurface(next, 'roof-1')?.poly.map((p) => Math.round(p.z ?? 0))
    expect(zs).toEqual([340, 340, 340, 340])
  })

  it('no-op als alle hoeken al die hoogte hebben', () => {
    const plan = planWithRoof([
      { x: 0, y: 0, z: 300 },
      { x: 100, y: 0, z: 300 },
      { x: 100, y: 80, z: 300 },
      { x: 0, y: 80, z: 300 },
    ])
    expect(setRidgeSurfaceHeightCm(plan, 'roof-1', 300)).toBe(plan)
  })

  it('klemt alle hoeken tot 800', () => {
    const plan = planWithRoof([
      { x: 0, y: 0, z: 760 },
      { x: 100, y: 0, z: 760 },
      { x: 100, y: 80, z: 790 },
      { x: 0, y: 80, z: 790 },
    ])
    const next = setRidgeSurfaceHeightCm(plan, 'roof-1', 900)
    const zs = findRidgeSurface(next, 'roof-1')?.poly.map((p) => Math.round(p.z ?? 0))
    expect(zs).toEqual([800, 800, 800, 800])
  })
})
