import { describe, expect, it } from 'vitest'
import {
  bindFloorWallsToRoofs,
  collectRoofCreases,
  listFloorsWithRoofPlanes,
  sampleRoofZAtPoint,
} from '@/core/fml/bind-walls-to-roofs'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  makeRoofSurface,
  markRoofSurfaceManual,
  setRidgeSurfacesOnFloor,
} from '@/core/fml/roof-planes'
import { markWallAsRidge, ridgeEndpointExtras, setRidgeWallsOnFloor } from '@/core/fml/ridge-walls'
import type { FloorPlan, Opening, Wall } from '@/core/fml/types'
import { wallEndpoint3D } from '@/core/fml/wall-endpoint-height'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  opts?: { heightCm?: number; bottomZ?: number; openings?: Opening[] },
): Wall {
  const z = opts?.bottomZ ?? 0
  const h = z + (opts?.heightCm ?? 280)
  return {
    id,
    a,
    b,
    thickness: 20,
    openings: opts?.openings ?? [],
    extras: { az: { z, h }, bz: { z, h } },
  }
}

/**
 * Zadeldak 400×800: nok y=400 z=380, goten y=0/800 z=280.
 * Twee dakvlakken delen de nokrand.
 */
function saddlePlan(opts?: { withUpperFloor?: boolean; withOutbuilding?: boolean }): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Bind', wallHeightCm: 280 })
  const walls = [
    wall('front', { x: 0, y: 0 }, { x: 400, y: 0 }),
    wall('back', { x: 0, y: 800 }, { x: 400, y: 800 }),
    wall('left', { x: 0, y: 0 }, { x: 0, y: 800 }),
    wall('right', { x: 400, y: 0 }, { x: 400, y: 800 }),
    wall('cross', { x: 0, y: 400 }, { x: 400, y: 400 }),
  ]
  if (opts?.withOutbuilding) {
    // Aanbouw naast hoofdgebouw (x 500–700), sky-exposed t.o.v. floor+1.
    walls.push(
      wall('out-f', { x: 500, y: 0 }, { x: 700, y: 0 }),
      wall('out-b', { x: 500, y: 200 }, { x: 700, y: 200 }),
      wall('out-l', { x: 500, y: 0 }, { x: 500, y: 200 }),
      wall('out-r', { x: 700, y: 0 }, { x: 700, y: 200 }),
    )
  }
  plan.floors[0].walls = walls

  const ridge = markWallAsRidge(
    wall('ridge', { x: 0, y: 400 }, { x: 400, y: 400 }),
    ridgeEndpointExtras(280, 30, 350),
  )
  plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])

  const south = markRoofSurfaceManual(
    makeRoofSurface({
      id: 'roof-s',
      origin: 'manual',
      poly: [
        { x: 0, y: 0, z: 280 },
        { x: 400, y: 0, z: 280 },
        { x: 400, y: 400, z: 380 },
        { x: 0, y: 400, z: 380 },
      ],
    }),
  )
  const north = markRoofSurfaceManual(
    makeRoofSurface({
      id: 'roof-n',
      origin: 'manual',
      poly: [
        { x: 0, y: 400, z: 380 },
        { x: 400, y: 400, z: 380 },
        { x: 400, y: 800, z: 280 },
        { x: 0, y: 800, z: 280 },
      ],
    }),
  )
  const roofs = [south, north]
  if (opts?.withOutbuilding) {
    roofs.push(
      markRoofSurfaceManual(
        makeRoofSurface({
          id: 'roof-out',
          origin: 'manual',
          poly: [
            { x: 500, y: 0, z: 260 },
            { x: 700, y: 0, z: 260 },
            { x: 700, y: 200, z: 260 },
            { x: 500, y: 200, z: 260 },
          ],
        }),
      ),
    )
  }
  plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], roofs)

  if (opts?.withUpperFloor) {
    plan.floors.push({
      name: '1e',
      level: 1,
      height: 280,
      walls: [
        wall('u-f', { x: 0, y: 0 }, { x: 400, y: 0 }),
        wall('u-b', { x: 0, y: 800 }, { x: 400, y: 800 }),
        wall('u-l', { x: 0, y: 0 }, { x: 0, y: 800 }),
        wall('u-r', { x: 400, y: 0 }, { x: 400, y: 800 }),
      ],
      areas: [
        {
          id: 'a1',
          poly: [
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            { x: 400, y: 800 },
            { x: 0, y: 800 },
          ],
          color: '#fff',
          showAreaLabel: false,
        },
      ],
    })
  }

  return plan
}

function endH(plan: FloorPlan, wallId: string, end: 'a' | 'b'): number {
  const wall = plan.floors[0].walls.find((item) => item.id === wallId)!
  return wallEndpoint3D(wall, end, plan.floors[0].height).h
}

function endZ(plan: FloorPlan, wallId: string, end: 'a' | 'b'): number {
  const wall = plan.floors[0].walls.find((item) => item.id === wallId)!
  return wallEndpoint3D(wall, end, plan.floors[0].height).z
}

describe('sampleRoofZAtPoint', () => {
  it('interpoleert goot→nok op hartlijn', () => {
    const plan = saddlePlan()
    const surfaces = plan.floors[0].designs?.find((d) => d.name === 'Dak')?.surfaces ?? []
    // Halfway south plane: y=200 → z = 280 + 0.5*(380-280) = 330
    expect(sampleRoofZAtPoint(surfaces, { x: 200, y: 200 })).toBe(330)
    expect(sampleRoofZAtPoint(surfaces, { x: 200, y: 400 })).toBe(380)
    expect(sampleRoofZAtPoint(surfaces, { x: 200, y: 0 })).toBe(280)
  })

  it('buiten dakvlak → null', () => {
    const plan = saddlePlan()
    const surfaces = plan.floors[0].designs?.find((d) => d.name === 'Dak')?.surfaces ?? []
    expect(sampleRoofZAtPoint(surfaces, { x: 900, y: 900 })).toBeNull()
  })
})

describe('bindFloorWallsToRoofs V1', () => {
  it('zadeldak: langsgevel goot; cross-muur scheef; floor.height ≥ max top; z ongewijzigd', () => {
    const plan = saddlePlan()
    const result = bindFloorWallsToRoofs(plan, 0)
    expect(result.boundJunctions).toBeGreaterThan(0)
    expect(result.splits).toBe(0)
    // Floorplanner: floor.height moet minstens tot nok-top.
    expect(result.plan.floors[0].height).toBe(380)

    // Langsgevel front (y=0): beide einden goot 280
    expect(endH(result.plan, 'front', 'a')).toBe(280)
    expect(endH(result.plan, 'front', 'b')).toBe(280)
    expect(endZ(result.plan, 'front', 'a')).toBe(0)

    // Cross op nok y=400: beide einden 380
    expect(endH(result.plan, 'cross', 'a')).toBe(380)
    expect(endH(result.plan, 'cross', 'b')).toBe(380)

    // Kopgevel left zonder split: beide einden goot 280
    expect(endH(result.plan, 'left', 'a')).toBe(280)
    expect(endH(result.plan, 'left', 'b')).toBe(280)
  })

  it('knopen onder floor+1 (verboden) blijven default', () => {
    const plan = saddlePlan({ withUpperFloor: true, withOutbuilding: true })
    const result = bindFloorWallsToRoofs(plan, 0)
    // Hoofdgebouw onder 1e → blocked
    expect(result.skippedBlocked).toBeGreaterThan(0)
    expect(endH(result.plan, 'front', 'a')).toBe(280)
    expect(endH(result.plan, 'cross', 'a')).toBe(280)
    // Aanbouw sky-exposed → gebonden op 260
    expect(endH(result.plan, 'out-f', 'a')).toBe(260)
    expect(result.boundJunctions).toBeGreaterThan(0)
    // Story-height blijft: 1e stapelt hierop (geen float).
    expect(result.plan.floors[0].height).toBe(280)
    expect(result.plan.floors[1].height).toBe(280)
    const upper = result.plan.floors[1].walls.find((item) => item.id === 'u-f')!
    expect(wallEndpoint3D(upper, 'a', 280).h).toBe(280)
    expect(wallEndpoint3D(upper, 'a', 280).z).toBe(0)
  })

  it('met floor erboven: floor.height blijft (1e/2e niet optillen)', () => {
    const plan = saddlePlan({ withUpperFloor: true, withOutbuilding: true })
    plan.floors.push({
      name: '2e',
      level: 2,
      height: 280,
      walls: [
        wall('2-f', { x: 0, y: 0 }, { x: 400, y: 0 }),
        wall('2-b', { x: 0, y: 800 }, { x: 400, y: 800 }),
      ],
    })
    const before1e = plan.floors[1].walls.map((item) => ({
      id: item.id,
      extras: item.extras,
    }))
    const result = bindFloorWallsToRoofs(plan, 0)
    expect(result.plan.floors[0].height).toBe(280)
    expect(result.plan.floors[1].height).toBe(280)
    expect(result.plan.floors[2].height).toBe(280)
    expect(result.plan.floors[1].walls.map((item) => item.extras)).toEqual(
      before1e.map((item) => item.extras),
    )
  })

  it('knopen buiten elk dakvlak: overslaan', () => {
    const plan = saddlePlan()
    plan.floors[0].walls.push(wall('orphan', { x: 900, y: 900 }, { x: 1000, y: 900 }))
    const result = bindFloorWallsToRoofs(plan, 0)
    expect(result.skippedUncovered).toBeGreaterThan(0)
    expect(endH(result.plan, 'orphan', 'a')).toBe(280)
  })

  it('opening boven lagere muurtop wordt geklemd', () => {
    const plan = saddlePlan()
    // Front blijft 280; zet opening te hoog, forceer bind die muur lager via custom roof.
    // Gebruik back op z=280 — opening met z=200 z_height=100 op front (top 300) → clamp.
    const front = plan.floors[0].walls.find((w) => w.id === 'front')!
    front.openings = [
      {
        refid: 'door',
        t: 0.5,
        width: 90,
        type: 'door',
        z: 0,
        z_height: 300,
      },
    ]
    // Dakvlak front-goot naar 250 zodat opening krimpt.
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      markRoofSurfaceManual(
        makeRoofSurface({
          id: 'roof-low',
          origin: 'manual',
          poly: [
            { x: -10, y: -10, z: 250 },
            { x: 410, y: -10, z: 250 },
            { x: 410, y: 810, z: 250 },
            { x: -10, y: 810, z: 250 },
          ],
        }),
      ),
    ])
    const result = bindFloorWallsToRoofs(plan, 0)
    const nextFront = result.plan.floors[0].walls.find((w) => w.id === 'front')!
    expect(endH(result.plan, 'front', 'a')).toBe(250)
    expect(nextFront.openings[0].z_height).toBeLessThanOrEqual(250)
  })

  it('listFloorsWithRoofPlanes', () => {
    const plan = saddlePlan()
    expect(listFloorsWithRoofPlanes(plan)).toEqual([{ floorIndex: 0, name: 'Begane grond' }])
  })
})

describe('bindFloorWallsToRoofs V2 crease-split', () => {
  it('collectRoofCreases vindt gedeelde nokrand', () => {
    const plan = saddlePlan()
    const floor = plan.floors[0]
    const surfaces = floor.designs?.find((d) => d.name === 'Dak')?.surfaces ?? []
    const creases = collectRoofCreases(surfaces, [])
    expect(creases.length).toBeGreaterThanOrEqual(1)
    const ridge = creases.find(
      (c) =>
        Math.abs(c.a.y - 400) < 1 &&
        Math.abs(c.b.y - 400) < 1 &&
        Math.min(c.a.x, c.b.x) <= 1 &&
        Math.max(c.a.x, c.b.x) >= 399,
    )
    expect(ridge).toBeTruthy()
  })

  it('kopgevel split op nok → driehoek (280 / 380 / 280)', () => {
    const plan = saddlePlan()
    const result = bindFloorWallsToRoofs(plan, 0, {
      splitCreases: true,
      splitWalls: splitWallAtT,
    })
    expect(result.splits).toBeGreaterThanOrEqual(2) // left + right gables
    const leftParts = result.plan.floors[0].walls.filter(
      (w) => w.id === 'left' || w.id.startsWith('left-split-'),
    )
    expect(leftParts.length).toBe(2)
    const tops = leftParts.flatMap((w) => [
      wallEndpoint3D(w, 'a', 280).h,
      wallEndpoint3D(w, 'b', 280).h,
    ])
    expect(tops).toContain(280)
    expect(tops).toContain(380)
  })

  it('te korte reststukken: geen knip', () => {
    const plan = saddlePlan()
    // Korte muur die nok net raakt maar te kort om te splitten.
    plan.floors[0].walls.push(wall('short', { x: 100, y: 398 }, { x: 100, y: 402 }))
    const before = plan.floors[0].walls.length
    const result = bindFloorWallsToRoofs(plan, 0, {
      splitCreases: true,
      splitWalls: splitWallAtT,
    })
    const shortStill = result.plan.floors[0].walls.find((w) => w.id === 'short')
    expect(shortStill).toBeTruthy()
    // short mag niet gesplitst zijn
    expect(result.plan.floors[0].walls.some((w) => w.id.startsWith('short-split-'))).toBe(false)
    expect(result.plan.floors[0].walls.length).toBeGreaterThanOrEqual(before)
  })
})
