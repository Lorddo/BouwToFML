import { describe, expect, it } from 'vitest'
import {
  countPlanFramedOpenings,
  createFactoryOpeningFrameDefaults,
  overwritePlanOpeningFrameSide,
  readPlanOpeningFrameDefaults,
  seedPlanOpeningFrameDefaults,
} from '@/core/plan/opening-frame-defaults'
import type { FloorPlan, Opening } from '@/core/plan/types'

function opening(partial: Partial<Opening> & Pick<Opening, 'id' | 'kind' | 'type'>): Opening {
  return {
    t: 0.5,
    width: 90,
    z_height: 220,
    ...partial,
  }
}

function planWithOpenings(): FloorPlan {
  return {
    name: 't',
    floors: [
      {
        name: 'bg',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x: 0, y: 0 },
            b: { x: 200, y: 0 },
            thickness: 20,
            openings: [
              opening({
                id: 'd1',
                kind: 'door.single',
                type: 'door',
                frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
              }),
              opening({ id: 'p1', kind: 'door.passage', type: 'door' }),
              opening({
                id: 'w1',
                kind: 'window.single',
                type: 'window',
                z: 100,
                z_height: 120,
                frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
              }),
            ],
          },
        ],
        items: [
          {
            id: 'sky1',
            kind: 'skylight',
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
          },
        ],
      },
    ],
  }
}

describe('opening-frame-defaults', () => {
  it('leest factory als het plan nog geen defaults heeft', () => {
    expect(readPlanOpeningFrameDefaults({ name: 't', floors: [] })).toEqual(
      createFactoryOpeningFrameDefaults(),
    )
  })

  it('zaait Settings-seed alleen als het veld ontbreekt', () => {
    const seeded = seedPlanOpeningFrameDefaults(planWithOpenings(), {
      door: { leftCm: 12, rightCm: 5, topCm: 5, bottomCm: 0 },
      window: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
    })
    expect(seeded.floors[0]?.defaults?.openingFrameDefaults?.door.leftCm).toBe(12)
    const again = seedPlanOpeningFrameDefaults(seeded, createFactoryOpeningFrameDefaults())
    expect(again.floors[0]?.defaults?.openingFrameDefaults?.door.leftCm).toBe(12)
  })

  it('overschrijft bestaande deur-kozijnen, slaat passage over', () => {
    const next = overwritePlanOpeningFrameSide(planWithOpenings(), 'door', 'leftCm', 18)
    const door = next.floors[0]?.walls[0]?.openings.find((o) => o.id === 'd1')
    const passage = next.floors[0]?.walls[0]?.openings.find((o) => o.id === 'p1')
    expect(door?.frame?.leftCm).toBe(18)
    expect(door?.frame?.rightCm).toBe(5)
    expect(passage?.frame).toBeUndefined()
  })

  it('overschrijft ramen én dakramen; telt framed openings zonder passage', () => {
    const plan = planWithOpenings()
    expect(countPlanFramedOpenings(plan, 'door')).toBe(1)
    expect(countPlanFramedOpenings(plan, 'window')).toBe(2)
    const next = overwritePlanOpeningFrameSide(plan, 'window', 'topCm', 9)
    const window = next.floors[0]?.walls[0]?.openings.find((o) => o.id === 'w1')
    const sky = next.floors[0]?.items?.find((item) => item.id === 'sky1')
    expect(window?.frame?.topCm).toBe(9)
    expect(sky?.frame?.topCm).toBe(9)
  })
})
