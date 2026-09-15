import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import type { FloorPlan, Wall } from '@/core/plan/types'
import {
  interpolateEndpoint3D,
  overwritePlanDoorHeights,
  overwritePlanWallHeights,
  setJunctionBottomZ,
  setJunctionElevationEdit,
  readJunctionElevation,
  setJunctionHeight,
  setWallsUniformHeight,
  splitWallEndpointExtras,
  wallElevationAtT,
  wallEndpointHeightCm,
  wallUniformBottomZCm,
  wallUniformHeightCm,
  withWallBottomKeepTop,
  withWallElevationEdit,
  withWallElevationShift,
  withWallUniformBottomZ,
} from '@/core/plan/wall-endpoint-height'
import { cloneWalls, splitWallAtPoint } from '@/core/plan/junction-core'
import { splitWallAtT } from '@/core/plan/wall-edit'

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
            id: 'd',
            kind: 'door.single',
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
    expect(next[0].elevation!.a.z).toBe(5)
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

  it('readJunctionElevation neemt knoop-eind, niet de verre muurhoogte', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 280 }, bz: { z: 10, h: 260 } },
      }),
      wall({
        id: 'w2',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 80 },
        extras: { az: { z: 10, h: 260 }, bz: { z: 0, h: 300 } },
      }),
    ]
    const elev = readJunctionElevation(
      walls,
      [
        { wallId: 'w1', end: 'b' },
        { wallId: 'w2', end: 'a' },
      ],
      280,
    )
    expect(elev).toEqual({ heightCm: 250, bottomZCm: 10 })
  })

  it('readJunctionElevation blijft één waarde als aangesloten muren verschillen', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 250 }, bz: { z: 0, h: 250 } },
      }),
      wall({
        id: 'w2',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 80 },
        extras: { az: { z: 0, h: 300 }, bz: { z: 0, h: 300 } },
      }),
    ]
    const elev = readJunctionElevation(
      walls,
      [
        { wallId: 'w1', end: 'b' },
        { wallId: 'w2', end: 'a' },
      ],
      280,
    )
    expect(elev).toEqual({ heightCm: 250, bottomZCm: 0 })
  })

  it('setJunctionBottomZ tilt knoop-ends; hoogte per eind blijft', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 300 } },
      }),
      wall({
        id: 'w2',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 80 },
        extras: { az: { z: 0, h: 250 }, bz: { z: 0, h: 280 } },
      }),
    ]
    const next = setJunctionBottomZ(
      walls,
      [
        { wallId: 'w1', end: 'b' },
        { wallId: 'w2', end: 'a' },
      ],
      40,
      280,
    )
    expect(next[0].elevation!.a.z).toBe(0)
    expect(next[0].elevation!.b).toEqual({ z: 40, h: 340 })
    expect(next[1].elevation!.a).toEqual({ z: 40, h: 290 })
    expect(next[1].elevation!.b.z).toBe(0)
    expect(wallEndpointHeightCm(next[0], 'b', 280)).toBe(300)
    expect(wallEndpointHeightCm(next[1], 'a', 280)).toBe(250)
  })

  it('setJunctionElevationEdit lift houdt top vast; shift beweegt z+h', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        extras: { az: { z: 0, h: 280 }, bz: { z: 10, h: 290 } },
      }),
      wall({
        id: 'w2',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 80 },
        extras: { az: { z: 10, h: 260 }, bz: { z: 0, h: 280 } },
      }),
    ]
    const refs = [
      { wallId: 'w1', end: 'b' as const },
      { wallId: 'w2', end: 'a' as const },
    ]
    const lifted = setJunctionElevationEdit(walls, refs, 'lift', 40, 280)
    expect(lifted[0].elevation!.b).toEqual({ z: 40, h: 290 })
    expect(lifted[1].elevation!.a).toEqual({ z: 40, h: 260 })

    const shifted = setJunctionElevationEdit(walls, refs, 'shift', 40, 280)
    expect(shifted[0].elevation!.b).toEqual({ z: 40, h: 320 })
    expect(shifted[1].elevation!.a).toEqual({ z: 40, h: 290 })
    expect(wallEndpointHeightCm(shifted[0], 'b', 280)).toBe(280)
    expect(wallEndpointHeightCm(shifted[1], 'a', 280)).toBe(250)
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
              openings: [{ type: 'door', id: 'd', kind: 'door.single', t: 0.5, width: 90, z_height: 220 }],
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

  it('cloneWalls kopieert elevation diep genoeg (geen shared a)', () => {
    const walls = [
      wall({
        id: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        elevation: { a: { z: 0, h: 280 }, b: { z: 0, h: 280 } },
      }),
    ]
    const cloned = cloneWalls(walls)
    cloned[0].elevation!.a.h = 999
    expect(walls[0].elevation!.a.h).toBe(280)
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

  it('overwritePlan* met floorIndex raakt alleen die verdieping', () => {
    const plan: FloorPlan = {
      name: 't',
      floors: [
        {
          name: 'bg',
          level: 0,
          height: 280,
          walls: [
            wall({
              id: 'w0',
              a: { x: 0, y: 0 },
              b: { x: 10, y: 0 },
              openings: [{ type: 'door', id: 'd', kind: 'door.single', t: 0.5, width: 90, z_height: 220 }],
            }),
          ],
        },
        {
          name: '1e',
          level: 1,
          height: 280,
          walls: [
            wall({
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 10, y: 0 },
              openings: [{ type: 'door', id: 'd', kind: 'door.single', t: 0.5, width: 90, z_height: 220 }],
            }),
          ],
        },
      ],
    }
    const next = overwritePlanDoorHeights(overwritePlanWallHeights(plan, 300, 1), 210, 1)
    expect(next.floors[0].height).toBe(280)
    expect(next.floors[1].height).toBe(300)
    expect(next.floors[0].walls[0].openings[0].z_height).toBe(220)
    expect(next.floors[1].walls[0].openings[0].z_height).toBe(210)
  })

  it('withWallUniformBottomZ tilt met behoud van hoogte', () => {
    const w = wall({
      id: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 250 } },
    })
    const next = withWallUniformBottomZ(w, 40, 280)
    expect(wallUniformBottomZCm(next, 280)).toBe(40)
    expect(wallEndpointHeightCm(next, 'a', 280)).toBe(280)
    expect(wallEndpointHeightCm(next, 'b', 280)).toBe(250)
    expect(next.elevation!.a.h).toBe(320)
    expect(next.elevation!.b.h).toBe(290)
  })

  it('withWallBottomKeepTop past onderkant; top blijft', () => {
    const w = wall({
      id: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 280 } },
    })
    const next = withWallBottomKeepTop(w, 80, 280)
    expect(wallUniformBottomZCm(next, 280)).toBe(80)
    expect(next.elevation!.a.h).toBe(280)
    expect(wallEndpointHeightCm(next, 'a', 280)).toBe(200)
  })

  it('withWallElevationShift verschuift z en h; hoogte gelijk', () => {
    const w = wall({
      id: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      extras: { az: { z: 10, h: 290 }, bz: { z: 10, h: 260 } },
    })
    const next = withWallElevationShift(w, 30, 280)
    expect(wallUniformBottomZCm(next, 280)).toBe(40)
    expect(wallEndpointHeightCm(next, 'a', 280)).toBe(280)
    expect(wallEndpointHeightCm(next, 'b', 280)).toBe(250)
  })

  it('withWallElevationEdit modes', () => {
    const w = wall({
      id: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      extras: { az: { z: 20, h: 300 }, bz: { z: 20, h: 300 } },
    })
    expect(wallEndpointHeightCm(withWallElevationEdit(w, 'height', 250, 280), 'a', 280)).toBe(250)
    expect(wallUniformBottomZCm(withWallElevationEdit(w, 'height', 250, 280), 280)).toBe(20)
    expect(wallUniformBottomZCm(withWallElevationEdit(w, 'lift', 50, 280), 280)).toBe(50)
    expect((withWallElevationEdit(w, 'lift', 50, 280).elevation!.a as { h: number }).h).toBe(300)
    expect(wallUniformBottomZCm(withWallElevationEdit(w, 'shift', 60, 280), 280)).toBe(60)
    expect(wallEndpointHeightCm(withWallElevationEdit(w, 'shift', 60, 280), 'a', 280)).toBe(280)
  })

  it('typed elevation ↔ FML az/bz roundtrip (adapter byte-identiek)', () => {
    const raw = {
      name: 'ElevRT',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          designs: [
            {
              name: 'Main',
              walls: [
                {
                  id: 'w1',
                  a: { x: 0, y: 0 },
                  b: { x: 100, y: 0 },
                  thickness: 20,
                  balance: 0.5,
                  az: { z: 10, h: 290 },
                  bz: { z: 0, h: 250 },
                  openings: [],
                  decor: { left: null, right: null, top: null, outline: 0 },
                  groupMarkerConfig: { locked: false },
                },
              ],
            },
          ],
        },
      ],
    }
    const { plan } = importFmlV3(raw)
    const wall0 = plan.floors[0].walls[0]
    expect(wall0.elevation).toEqual({ a: { z: 10, h: 290 }, b: { z: 0, h: 250 } })
    expect(wall0.extras?.az).toBeUndefined()
    expect(wall0.extras?.bz).toBeUndefined()

    const exported = JSON.parse(buildFmlV3(plan))
    const outWall = exported.floors[0].designs[0].walls[0]
    expect(outWall.az).toEqual({ z: 10, h: 290 })
    expect(outWall.bz).toEqual({ z: 0, h: 250 })

    // Domain JSON (`.plg`-achtig): elevation blijft staan, geen az/bz in extras.
    const domainRoundtrip = JSON.parse(JSON.stringify(plan)) as typeof plan
    expect(domainRoundtrip.floors[0].walls[0].elevation).toEqual({
      a: { z: 10, h: 290 },
      b: { z: 0, h: 250 },
    })
  })
})
