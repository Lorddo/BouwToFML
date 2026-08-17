import { describe, expect, it } from 'vitest'
import {
  ALIGN_FIXTURE_ORIGIN_EPS_CM,
  FML_ALIGN_FIXTURE_REFID,
  rebasePlanToItemRefid,
} from '@/core/fml/rebase-plan-to-item-refid'
import type { Floor, FloorPlan } from '@/core/fml/types'

function floorWithBottle(
  name: string,
  bottle: { x: number; y: number } | null,
  extras?: Partial<Floor>,
): Floor {
  return {
    name,
    level: 0,
    height: 280,
    walls: [
      {
        id: `${name}-w`,
        a: { x: 10, y: 20 },
        b: { x: 110, y: 20 },
        thickness: 15,
        openings: [],
      },
    ],
    items: bottle
      ? [
          {
            refid: FML_ALIGN_FIXTURE_REFID,
            x: bottle.x,
            y: bottle.y,
            width: 8,
            height: 8,
          },
        ]
      : [{ refid: 'other', x: 50, y: 60, width: 40, height: 40 }],
    ...extras,
  }
}

function samplePlan(floors: Floor[]): FloorPlan {
  return { name: 'Test', floors }
}

describe('rebasePlanToItemRefid', () => {
  it('zet oil bottle op (0,0) per floor; floor zonder fles blijft', () => {
    const plan = samplePlan([
      floorWithBottle('BG', { x: 40, y: -80 }),
      floorWithBottle('1e', { x: 42, y: -79 }),
      floorWithBottle('2e', null),
    ])
    const result = rebasePlanToItemRefid(plan)
    expect(result.moved).toEqual([0, 1])
    expect(result.missing).toEqual([2])
    expect(result.alreadyAtOrigin).toEqual([])
    expect(result.plan.floors[0]?.items?.[0]).toMatchObject({ x: 0, y: 0 })
    expect(result.plan.floors[1]?.items?.[0]).toMatchObject({ x: 0, y: 0 })
    expect(result.plan.floors[0]?.walls[0]?.a).toEqual({ x: -30, y: 100 })
    expect(result.plan.floors[1]?.walls[0]?.a).toEqual({ x: -32, y: 99 })
    expect(result.plan.floors[2]?.walls[0]?.a).toEqual({ x: 10, y: 20 })
    expect(result.plan.floors[2]?.items?.[0]).toMatchObject({ x: 50, y: 60 })
  })

  it('slaat floors over waar de fles al op origin ligt', () => {
    const plan = samplePlan([
      floorWithBottle('BG', { x: 0, y: 0 }),
      floorWithBottle('1e', { x: ALIGN_FIXTURE_ORIGIN_EPS_CM / 2, y: 0 }),
    ])
    const result = rebasePlanToItemRefid(plan)
    expect(result.moved).toEqual([])
    expect(result.alreadyAtOrigin).toEqual([0, 1])
    expect(result.plan.floors[0]?.walls[0]?.a).toEqual({ x: 10, y: 20 })
  })

  it('schuift drawing-midden mee en muteert het input-plan niet', () => {
    const drawing = { x: 200, y: 300, width: 400, height: 500, rotation: 0 }
    const plan = samplePlan([floorWithBottle('BG', { x: 40, y: -80 }, { drawing })])
    const result = rebasePlanToItemRefid(plan)
    expect(result.moved).toEqual([0])
    expect(result.plan.floors[0]?.drawing).toEqual({
      x: 160,
      y: 380,
      width: 400,
      height: 500,
      rotation: 0,
    })
    expect(drawing).toEqual({ x: 200, y: 300, width: 400, height: 500, rotation: 0 })
    expect(plan.floors[0]?.items?.[0]).toMatchObject({ x: 40, y: -80 })
  })
})
