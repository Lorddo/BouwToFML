import { describe, expect, it } from 'vitest'
import {
  applyStampToFloor,
  injectStampWallsIntoPlan,
  STAMP_INJECT_SEGMENT_EPS_CM,
} from '@/core/fml/apply-stamp-to-floor'
import {
  assignWallsToStamp,
  ensureStampFacadeGroup,
  createFacadeGroup,
  assignWallsToGroup,
  groupIdForWall,
} from '@/core/fml/facade-groups'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import type { FloorPlan, Wall } from '@/core/fml/types'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness = 20,
): Wall {
  return { id, a, b, thickness, openings: [] }
}

describe('injectStampWallsIntoPlan', () => {
  it('voegt muren toe met offset en pinned ids; houdt dikte', () => {
    const plan = createEmptyFloorPlan({ name: 'Target' })
    plan.floors[0].walls = [wall('det-1', { x: 0, y: 0 }, { x: 50, y: 0 }, 12)]
    plan.floors[0].height = 280

    const sources = [wall('src-1', { x: 100, y: 0 }, { x: 200, y: 0 }, 35)]
    const result = injectStampWallsIntoPlan(plan, 0, sources, {
      offsetCm: { x: 5, y: -2 },
      replaceOverlap: true,
    })

    expect(result.pinnedWallIds).toHaveLength(1)
    expect(result.addedWallIds).toEqual(result.pinnedWallIds)
    const injected = result.plan.floors[0].walls.find((w) => w.id === result.pinnedWallIds[0])
    expect(injected?.thickness).toBe(35)
    expect(injected?.a).toEqual({ x: 105, y: -2 })
    expect(injected?.b).toEqual({ x: 205, y: -2 })
    expect(result.plan.floors[0].walls.some((w) => w.id === 'det-1')).toBe(true)
  })

  it('vervangt overlappende detectie-segmenten binnen eps', () => {
    const plan = createEmptyFloorPlan({ name: 'Target' })
    plan.floors[0].walls = [
      wall('det-overlap', { x: 100.5, y: 0.2 }, { x: 200.3, y: -0.1 }, 10),
      wall('det-keep', { x: 0, y: 50 }, { x: 80, y: 50 }, 10),
    ]

    const sources = [wall('src-1', { x: 100, y: 0 }, { x: 200, y: 0 }, 22)]
    const result = injectStampWallsIntoPlan(plan, 0, sources, {
      offsetCm: { x: 0, y: 0 },
      epsCm: STAMP_INJECT_SEGMENT_EPS_CM,
      replaceOverlap: true,
    })

    expect(result.removedOverlapCount).toBe(1)
    expect(result.plan.floors[0].walls.some((w) => w.id === 'det-overlap')).toBe(false)
    expect(result.plan.floors[0].walls.some((w) => w.id === 'det-keep')).toBe(true)
    expect(result.pinnedWallIds).toHaveLength(1)
    expect(
      result.plan.floors[0].walls.find((w) => result.pinnedWallIds.includes(w.id))?.thickness,
    ).toBe(22)
  })

  it('neemt gevel over via facadeLookupPlan; niet in stamp', () => {
    const donor: FloorPlan = createEmptyFloorPlan({ name: 'Donor' })
    donor.floors[0].walls = [wall('src-1', { x: 0, y: 0 }, { x: 10, y: 0 }, 20)]
    ensureStampFacadeGroup(donor)
    assignWallsToStamp(donor, ['src-1'])
    const facade = createFacadeGroup(donor, { name: 'Voor' })
    assignWallsToGroup(donor, facade.id, ['src-1'])

    const target = createEmptyFloorPlan({ name: 'Target' })
    target.floors[0].walls = []
    const result = injectStampWallsIntoPlan(target, 0, donor.floors[0].walls, {
      facadeLookupPlan: donor,
    })
    const newId = result.pinnedWallIds[0]
    expect(groupIdForWall(result.plan, newId)).toBe(facade.id)
  })
})

describe('applyStampToFloor (regressie)', () => {
  it('slaat bestaande segment over binnen 1 cm', () => {
    const plan = createEmptyFloorPlan({ name: 'Multi' })
    plan.floors[0].walls = [wall('s1', { x: 0, y: 0 }, { x: 100, y: 0 }, 20)]
    plan.floors.push({
      name: '1e',
      level: 1,
      height: 260,
      walls: [wall('existing', { x: 0.2, y: 0 }, { x: 100.1, y: 0 }, 15)],
    })
    ensureStampFacadeGroup(plan)
    assignWallsToStamp(plan, ['s1'])

    const result = applyStampToFloor(plan, 1)
    expect(result.addedWallIds).toHaveLength(0)
    expect(result.skippedCount).toBe(1)
  })
})
