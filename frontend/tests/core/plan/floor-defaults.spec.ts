import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import {
  applyFloorDefaultNumber,
  applyOpeningFrameDefault,
  createFactoryFloorDefaults,
  readFloorDefaults,
  seedMissingFloorDefaults,
} from '@/core/plan/floor-defaults'
import type { FloorPlan, Opening } from '@/core/plan/types'

function opening(partial: Partial<Opening> & Pick<Opening, 'id' | 'kind' | 'type'>): Opening {
  return {
    t: 0.5,
    width: 90,
    z_height: 210,
    ...partial,
  }
}

function twoFloorPlan(): FloorPlan {
  return {
    name: 't',
    settings: {
      openingFrameDefaults: {
        door: { leftCm: 12, rightCm: 5, topCm: 5, bottomCm: 0 },
        window: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
      },
    },
    floors: [
      {
        name: 'bg',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w0',
            a: { x: 0, y: 0 },
            b: { x: 200, y: 0 },
            thickness: 20,
            openings: [
              opening({
                id: 'd0',
                kind: 'door.single',
                type: 'door',
                frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
              }),
            ],
          },
        ],
      },
      {
        name: '1e',
        level: 1,
        height: 260,
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
                z_height: 230,
                frame: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
              }),
            ],
          },
        ],
      },
    ],
  }
}

describe('floor-defaults', () => {
  it('zaait ontbrekende defaults uit geometrie + legacy plan-frames', () => {
    const seeded = seedMissingFloorDefaults(twoFloorPlan())
    expect(seeded.floors[0]?.defaults?.doorHeightCm).toBe(210)
    expect(seeded.floors[1]?.defaults?.doorHeightCm).toBe(230)
    expect(seeded.floors[0]?.defaults?.openingFrameDefaults.door.leftCm).toBe(12)
    expect(seeded.settings?.openingFrameDefaults).toBeUndefined()
  })

  it('Alleen nieuwe schrijft default, laat bestaande deuren', () => {
    const seeded = seedMissingFloorDefaults(twoFloorPlan())
    const next = applyFloorDefaultNumber(seeded, 0, 'doorHeightCm', 240, 'defaultsOnly')
    expect(readFloorDefaults(next, 0).doorHeightCm).toBe(240)
    expect(next.floors[0]?.walls[0]?.openings[0]?.z_height).toBe(210)
    expect(readFloorDefaults(next, 1).doorHeightCm).toBe(230)
  })

  it('Verdieping overschrijft alleen die floor', () => {
    const seeded = seedMissingFloorDefaults(twoFloorPlan())
    const next = applyFloorDefaultNumber(seeded, 0, 'doorHeightCm', 240, 'floor')
    expect(next.floors[0]?.walls[0]?.openings[0]?.z_height).toBe(240)
    expect(next.floors[1]?.walls[0]?.openings[0]?.z_height).toBe(230)
  })

  it('Project kopieert default naar alle floors en overschrijft instances', () => {
    const seeded = seedMissingFloorDefaults(twoFloorPlan())
    const next = applyFloorDefaultNumber(seeded, 0, 'doorHeightCm', 240, 'project')
    expect(readFloorDefaults(next, 0).doorHeightCm).toBe(240)
    expect(readFloorDefaults(next, 1).doorHeightCm).toBe(240)
    expect(next.floors[0]?.walls[0]?.openings[0]?.z_height).toBe(240)
    expect(next.floors[1]?.walls[0]?.openings[0]?.z_height).toBe(240)
  })

  it('FML-export schrijft floor.defaults niet; packed flags worden losse ramen', () => {
    const seeded = seedMissingFloorDefaults(twoFloorPlan())
    const floor = seeded.floors[0]
    if (!floor?.defaults || !floor.walls[0]) throw new Error('expected seeded floor')
    floor.defaults = {
      ...floor.defaults,
      bovenlichtDefault: true,
      bovenlichtHeightCm: 55,
      bovenlichtGapCm: 8,
    }
    floor.walls[0].openings[0] = {
      ...floor.walls[0].openings[0],
      bovenlicht: true,
    }
    const json = JSON.parse(buildFmlV3(seeded)) as {
      floors: Array<{
        defaults?: unknown
        designs: Array<{ walls: Array<{ openings: Array<Record<string, unknown>> }> }>
      }>
    }
    expect(json.floors[0]?.defaults).toBeUndefined()
    const openings = json.floors[0]?.designs[0]?.walls[0]?.openings ?? []
    expect(openings).toHaveLength(2)
    expect(openings[0]?.bovenlicht).toBeUndefined()
    expect(openings[1]?.z_height).toBe(55)
  })

  it('factory blijft staan als er geen geometrie is', () => {
    const empty: FloorPlan = {
      name: 't',
      floors: [{ name: 'bg', level: 0, height: 280, walls: [] }],
    }
    const seeded = seedMissingFloorDefaults(empty)
    expect(readFloorDefaults(seeded, 0)).toEqual(createFactoryFloorDefaults())
  })

  it('kozijn Alleen nieuwe raakt geen bestaande frames', () => {
    const seeded = seedMissingFloorDefaults(twoFloorPlan())
    const next = applyOpeningFrameDefault(seeded, 0, 'door', 'leftCm', 18, 'defaultsOnly')
    expect(readFloorDefaults(next, 0).openingFrameDefaults.door.leftCm).toBe(18)
    expect(next.floors[0]?.walls[0]?.openings[0]?.frame?.leftCm).toBe(5)
  })
})
