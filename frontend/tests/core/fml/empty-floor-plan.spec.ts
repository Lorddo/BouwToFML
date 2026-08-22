import { describe, expect, it } from 'vitest'
import {
  createBlankFloor,
  createEmptyFloorPlan,
  DEFAULT_EMPTY_FLOOR_NAME,
  emptyFloorNameIndexed,
} from '@/core/fml/empty-floor-plan'
import { findRidgeDesignIndex, isRidgeDesign } from '@/core/fml/ridge-walls'

describe('createEmptyFloorPlan', () => {
  it('één begane grond, geen muren, hoogte uit opts', () => {
    const plan = createEmptyFloorPlan({ name: 'Hoofdstraat 1', wallHeightCm: 275 })
    expect(plan.name).toBe('Hoofdstraat 1')
    expect(plan.floors).toHaveLength(1)
    expect(plan.floors[0]?.name).toBe(DEFAULT_EMPTY_FLOOR_NAME)
    expect(plan.floors[0]?.level).toBe(0)
    expect(plan.floors[0]?.height).toBe(275)
    expect(plan.floors[0]?.walls).toEqual([])
    expect(findRidgeDesignIndex(plan.floors[0])).toBeGreaterThanOrEqual(0)
  })

  it('createBlankFloor + indexed naam voor extra verdieping', () => {
    const floor = createBlankFloor({
      name: emptyFloorNameIndexed(1),
      level: 1,
      wallHeightCm: 260.4,
    })
    expect(floor.name).toBe('Verdieping 1')
    expect(floor.level).toBe(1)
    expect(floor.height).toBe(260)
    expect(floor.walls).toEqual([])
    const dakIndex = findRidgeDesignIndex(floor)
    expect(dakIndex).toBeGreaterThanOrEqual(0)
    expect(isRidgeDesign(floor.designs?.[dakIndex])).toBe(true)
    expect(floor.activeDesignIndex ?? 0).toBe(0)
  })
})
