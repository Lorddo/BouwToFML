import { describe, expect, it } from 'vitest'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  applyElevationRidgeRect,
  collectElevationRidgeJunctionSnapXs,
  snapElevationRidgeCenter,
} from '@/core/fml/elevation-ridge-edit'
import { assignWallsToGroup, createFacadeGroup } from '@/core/fml/facade-groups'
import { projectFacadeElevation } from '@/core/fml/facade-elevation'
import { floorWallBaseWorldZ } from '@/core/fml/floor-stack'
import {
  listRidgeWallsOnFloor,
  markWallAsRidge,
  ridgeDisplayWidthCm,
  ridgeEndpointZCm,
  ridgeEndpointExtras,
  setRidgeWallsOnFloor,
} from '@/core/fml/ridge-walls'
import type { Wall } from '@/core/fml/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

describe('applyElevationRidgeRect', () => {
  it('verschuift kopse nok in X en Z en past weergavebreedte', () => {
    const plan = createEmptyFloorPlan({ name: 'Kopse', wallHeightCm: 280 })
    plan.floors[0].walls = [wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })]
    const group = createFacadeGroup(plan, { name: 'Voorgevel' })
    assignWallsToGroup(plan, group.id, ['front'])
    const ridge = markWallAsRidge(
      wall('r1', { x: 200, y: 0 }, { x: 200, y: 180 }),
      ridgeEndpointExtras(280, 20, 350),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elev = projectFacadeElevation(plan, group.id)!
    const rect = elev.walls.find((item) => item.wallId === 'r1')!
    expect(rect.endOn).toBe(true)
    const moved = {
      x0: rect.x0 + 40,
      x1: rect.x1 + 40,
      y0: rect.y0 - 30,
      y1: rect.y1 - 30,
    }
    const next = applyElevationRidgeRect({
      plan,
      axis: elev.axis,
      floorIndex: 0,
      wallId: 'r1',
      startWall: ridge,
      startRect: rect,
      nextRect: moved,
    })
    const written = listRidgeWallsOnFloor(next.floors[0])[0]
    expect(written.a.x).toBeCloseTo(240, 5)
    expect(written.b.x).toBeCloseTo(240, 5)
    const base = floorWallBaseWorldZ(next, 0)
    expect(ridgeEndpointZCm(written, 'a', 280)).toBe(
      Math.round(-Math.max(moved.y0, moved.y1) - base),
    )
    const wider = applyElevationRidgeRect({
      plan: next,
      axis: elev.axis,
      floorIndex: 0,
      wallId: 'r1',
      startWall: written,
      startRect: moved,
      nextRect: { ...moved, x0: moved.x0 - 6, x1: moved.x1 + 6 },
    })
    expect(ridgeDisplayWidthCm(wider)).toBeGreaterThan(ridgeDisplayWidthCm(next))
  })

  it('midden snapt alleen op muurjunctions, niet op faces', () => {
    const plan = createEmptyFloorPlan({ name: 'Snap', wallHeightCm: 280 })
    plan.floors[0].walls = [wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })]
    const group = createFacadeGroup(plan, { name: 'Voorgevel' })
    assignWallsToGroup(plan, group.id, ['front'])
    const ridge = markWallAsRidge(
      wall('r1', { x: 200, y: 0 }, { x: 200, y: 180 }),
      ridgeEndpointExtras(280, 20, 350),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elev = projectFacadeElevation(plan, group.id)!
    const xs = collectElevationRidgeJunctionSnapXs(elev)
    expect(xs.some((x) => Math.abs(x) < 1 || Math.abs(x - 400) < 1)).toBe(true)
    const front = elev.walls.find((item) => item.wallId === 'front')!
    expect(xs.every((x) => Math.abs(x - front.aTop.x) > 0.5)).toBe(true)
    const rect = { x0: 392, x1: 404, y0: -400, y1: -360 }
    const snapped = snapElevationRidgeCenter(rect, xs)
    expect(snapped.guide.x).toBeCloseTo(400, 0)
    expect((snapped.rect.x0 + snapped.rect.x1) / 2).toBeCloseTo(400, 0)
  })
})
