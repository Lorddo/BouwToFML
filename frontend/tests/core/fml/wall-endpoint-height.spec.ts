import { describe, expect, it } from 'vitest'
import type { FloorPlan, Wall } from '@/core/fml/types'
import {
  interpolateEndpoint3D,
  overwritePlanDoorHeights,
  overwritePlanWallHeights,
  setJunctionHeight,
  setWallsUniformHeight,
  splitWallEndpointExtras,
  wallElevationAtT,
  wallEndpointHeightCm,
  wallUniformHeightCm,
} from '@/core/fml/wall-endpoint-height'
import { cloneWalls, splitWallAtPoint } from '@/ui/components/fml-preview-junction-core'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'

function wall(partial: Partial<Wall> & Pick<Wall, 'id' | 'a' | 'b'>): Wall {
  return {
    thickness: 20,
    openings: [],
    ...partial,
  }
}

describe('wall-endpoint-height', () => {
  it('hoogte = h - z met floor-fallback zonder extras', () => {
    const w = wall({ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } })
    expect(wallEndpointHeightCm(w, 'a', 280)).toBe(280)
    expect(wallEndpointHeightCm(w, 'b', 280)).toBe(280)
  })

  it('leest expliciete az/bz', () => {
    const w = wall({
      id: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      extras: { az: { z: 10, h: 310 }, bz: { z: 0, h: 250 } },
    })
    expect(wallEndpointHeightCm(w, 'a', 280)).toBe(300)
    expect(wallEndpointHeightCm(w, 'b', 280)).toBe(250)
    expect(wallUniformHeightCm(w, 280)).toBeNull()
    expect(wallElevationAtT(w, 0.5, 280)).toEqual({ z: 5, h: 280 })
  })

  it('setWallsUniformHeight zet beide ends; deuren blijven', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 5, h: 285 }, bz: { z: 5, h: 285 } },
        openings: [
          {
            type: 'door',
            refid: 'd',
            t: 0.5,
            width: 90,
            z_height: 220,
          },
        ],
      }),
    ]
    const next = setWallsUniformHeight(walls, ['w1'], 300, 280)
    expect(wallEndpointHeightCm(next[0], 'a', 280)).toBe(300)
    expect(wallEndpointHeightCm(next[0], 'b', 280)).toBe(300)
    expect((next[0].extras!.az as { z: number }).z).toBe(5)
    expect(next[0].openings[0].z_height).toBe(220)
  })

  it('setJunctionHeight past alleen die ends aan', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 280 } },
      }),
      wall({
        id: 'w2',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 80 },
        extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 280 } },
      }),
    ]
    const next = setJunctionHeight(
      walls,
      [
        { wallId: 'w1', end: 'b' },
        { wallId: 'w2', end: 'a' },
      ],
      250,
      280,
    )
    expect(wallEndpointHeightCm(next[0], 'a', 280)).toBe(280)
    expect(wallEndpointHeightCm(next[0], 'b', 280)).toBe(250)
    expect(wallEndpointHeightCm(next[1], 'a', 280)).toBe(250)
    expect(wallEndpointHeightCm(next[1], 'b', 280)).toBe(280)
  })

  it('overwritePlanWallHeights laat deuren staan', () => {
    const plan: FloorPlan = {
      name: 't',
      floors: [
        {
          name: 'bg',
          level: 0,
          height: 280,
          walls: [
            wall({
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 10, y: 0 },
              openings: [{ type: 'door', refid: 'd', t: 0.5, width: 90, z_height: 220 }],
            }),
          ],
        },
      ],
    }
    const next = overwritePlanWallHeights(plan, 300)
    expect(next.floors[0].height).toBe(300)
    expect(wallEndpointHeightCm(next.floors[0].walls[0], 'a', 300)).toBe(300)
    expect(next.floors[0].walls[0].openings[0].z_height).toBe(220)

    const doorsOnly = overwritePlanDoorHeights(plan, 210)
    expect(doorsOnly.floors[0].height).toBe(280)
    expect(doorsOnly.floors[0].walls[0].openings[0].z_height).toBe(210)
  })

  it('split interpolatie az/bz op t', () => {
    const az = { z: 0, h: 200 }
    const bz = { z: 0, h: 300 }
    const mid = interpolateEndpoint3D(az, bz, 0.5)
    expect(mid.h).toBe(250)

    const source = wall({
      id: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      extras: { az, bz, decor: { left: null } },
    })
    const { firstExtras, secondExtras } = splitWallEndpointExtras(source, 0.5)
    expect((firstExtras!.az as { h: number }).h).toBe(200)
    expect((firstExtras!.bz as { h: number }).h).toBe(250)
    expect((secondExtras!.az as { h: number }).h).toBe(250)
    expect((secondExtras!.bz as { h: number }).h).toBe(300)
    expect(firstExtras!.decor).toEqual({ left: null })
  })

  it('cloneWalls kopieert extras diep genoeg (geen shared az)', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 280 } },
      }),
    ]
    const cloned = cloneWalls(walls)
    ;(cloned[0].extras!.az as { h: number }).h = 999
    expect((walls[0].extras!.az as { h: number }).h).toBe(280)
  })

  it('splitWallAtT schrijft geïnterpoleerde az/bz', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 200 }, bz: { z: 0, h: 300 } },
      }),
    ]
    const result = splitWallAtT(walls, 'w1', 0.5)
    expect(result).not.toBeNull()
    expect(wallEndpointHeightCm(result!.walls[0], 'a', 280)).toBe(200)
    expect(wallEndpointHeightCm(result!.walls[0], 'b', 280)).toBe(250)
    expect(wallEndpointHeightCm(result!.walls[1], 'a', 280)).toBe(250)
    expect(wallEndpointHeightCm(result!.walls[1], 'b', 280)).toBe(300)
  })

  it('splitWallAtPoint schrijft geïnterpoleerde az/bz in-place', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 200 }, bz: { z: 0, h: 300 } },
      }),
    ]
    expect(splitWallAtPoint(walls, walls[0], { x: 50, y: 0 }, 0.5)).toBe(true)
    expect(walls).toHaveLength(2)
    expect(wallEndpointHeightCm(walls[0], 'b', 280)).toBe(250)
    expect(wallEndpointHeightCm(walls[1], 'a', 280)).toBe(250)
  })
})
