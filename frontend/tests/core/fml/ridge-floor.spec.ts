import { describe, expect, it } from 'vitest'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  findFloorIndexForRidgeWall,
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
