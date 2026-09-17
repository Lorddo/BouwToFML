import { describe, expect, it } from 'vitest'
import {
  bindFloorWallsToRoofs,
  collectRoofCreases,
  listFloorsWithRoofPlanes,
  sampleCeilingRoofAtPoint,
  sampleRoofZAtPoint,
  syncDormerAssemblyAfterRoofEdit,
} from '@/core/plan/bind-walls-to-roofs'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import {
  isDormerLikeRoof,
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  markRoofSurfaceManual,
  setRidgeSurfaceVerticesZ,
  setRidgeSurfacesOnFloor,
} from '@/core/plan/roof-planes'
import { markWallAsRidge, ridgeEndpointExtras, setRidgeWallsOnFloor } from '@/core/plan/ridge-walls'
import type { FloorPlan, Opening, Wall } from '@/core/plan/types'
import { wallEndpoint3D } from '@/core/plan/wall-endpoint-height'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  opts?: { heightCm?: number; bottomZ?: number; openings?: Opening[]; thickness?: number },
): Wall {
  const z = opts?.bottomZ ?? 0
  const h = z + (opts?.heightCm ?? 280)
  return {
    id,
    a,
    b,
    thickness: opts?.thickness ?? 20,
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

/** Dakkapel op de zuid-oosthoek (y=0–150, x=250–400), Z op de ouder op de binnenrand. */
function saddleWithCornerDormer(): FloorPlan {
  const plan = saddlePlan()
  const existing = plan.floors[0].designs?.find((d) => d.name === 'Dak')?.surfaces ?? []
  plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
    ...existing,
    makeRoofSurface({
      id: 'dormer',
      origin: 'manual',
      roofKind: 'dormer',
      roofParentId: 'roof-s',
      poly: [
        { x: 250, y: 0, z: 280 },
        { x: 400, y: 0, z: 280 },
        { x: 400, y: 150, z: 318 },
        { x: 250, y: 150, z: 318 },
      ],
    }),
  ])
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
        id: 'door',
        kind: 'door.single',
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
    })
    const shortStill = result.plan.floors[0].walls.find((w) => w.id === 'short')
    expect(shortStill).toBeTruthy()
    // short mag niet gesplitst zijn
    expect(result.plan.floors[0].walls.some((w) => w.id.startsWith('short-split-'))).toBe(false)
    expect(result.plan.floors[0].walls.length).toBeGreaterThanOrEqual(before)
  })

  /**
   * MK-gevel: zelfde overspanning binnen (10 cm) en buiten (37 cm).
   * Nok 22,6 cm van een T-knoop — rest < ½ geveldikte, wél ≥ 4 cm.
   */
  it('dikke gevel knipt op nok ook als rest < ½ dikte', () => {
    const plan = createEmptyFloorPlan({ name: 'MK', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('front', { x: 533.2, y: 927.2 }, { x: 586.6, y: 927.2 }, { thickness: 37 }),
      wall('inner', { x: 533.2, y: 830 }, { x: 586.6, y: 830 }, { thickness: 10 }),
      wall('left', { x: 533.2, y: 830 }, { x: 533.2, y: 927.2 }, { thickness: 10 }),
      wall('right', { x: 586.6, y: 830 }, { x: 586.6, y: 927.2 }, { thickness: 21 }),
    ]
    const leftRoof = markRoofSurfaceManual(
      makeRoofSurface({
        id: 'roof-l',
        origin: 'manual',
        poly: [
          { x: 500, y: 800, z: 450 },
          { x: 555.8, y: 800, z: 458 },
          { x: 555.8, y: 960, z: 458 },
          { x: 500, y: 960, z: 450 },
        ],
      }),
    )
    const rightRoof = markRoofSurfaceManual(
      makeRoofSurface({
        id: 'roof-r',
        origin: 'manual',
        poly: [
          { x: 555.8, y: 800, z: 458 },
          { x: 620, y: 800, z: 445 },
          { x: 620, y: 960, z: 445 },
          { x: 555.8, y: 960, z: 458 },
        ],
      }),
    )
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [leftRoof, rightRoof])
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [
      markWallAsRidge(
        wall('ridge', { x: 555.8, y: 800 }, { x: 555.8, y: 960 }),
        ridgeEndpointExtras(436, 30, 30),
      ),
    ])

    const result = bindFloorWallsToRoofs(plan, 0, {
      splitCreases: true,
    })
    const frontParts = result.plan.floors[0].walls.filter(
      (w) => w.id === 'front' || w.id.startsWith('front-split-'),
    )
    const innerParts = result.plan.floors[0].walls.filter(
      (w) => w.id === 'inner' || w.id.startsWith('inner-split-'),
    )
    expect(frontParts.length).toBe(2)
    expect(innerParts.length).toBe(2)
    const frontRidgeX = frontParts.flatMap((w) => [w.a.x, w.b.x])
    expect(frontRidgeX.some((x) => Math.abs(x - 555.8) < 1)).toBe(true)
    const frontTops = frontParts.flatMap((w) => [
      wallEndpoint3D(w, 'a', 280).h,
      wallEndpoint3D(w, 'b', 280).h,
    ])
    expect(Math.max(...frontTops)).toBeGreaterThanOrEqual(456)

    const twice = bindFloorWallsToRoofs(result.plan, 0, {
      splitCreases: true,
    })
    expect(twice.splits).toBe(0)
  })

  it('collectRoofCreases neemt dakkapel-omtrek mee', () => {
    const plan = saddleWithCornerDormer()
    const surfaces = plan.floors[0].designs?.find((d) => d.name === 'Dak')?.surfaces ?? []
    const creases = collectRoofCreases(surfaces, [])
    const inner = creases.find(
      (c) =>
        Math.abs(Math.min(c.a.y, c.b.y) - 150) < 1 &&
        Math.abs(Math.max(c.a.y, c.b.y) - 150) < 1 &&
        Math.min(c.a.x, c.b.x) <= 251 &&
        Math.max(c.a.x, c.b.x) >= 399,
    )
    expect(inner).toBeTruthy()
  })

  it('lange gevel splitst op dakkapel-rand; wang niet flush, kopse wel', () => {
    const plan = saddleWithCornerDormer()
    const result = bindFloorWallsToRoofs(plan, 0, {
      splitCreases: true,
    })
    const rightParts = result.plan.floors[0].walls.filter(
      (w) => w.id === 'right' || w.id.startsWith('right-split-'),
    )
    expect(rightParts.length).toBe(3)
    const cheek = rightParts.find((w) => {
      const lo = Math.min(w.a.y, w.b.y)
      const hi = Math.max(w.a.y, w.b.y)
      return lo < 10 && hi > 140 && hi < 200
    })
    expect(cheek).toBeTruthy()
    expect(cheek!.balance === 0 || cheek!.balance === 1).toBe(false)
    const cheekTops = [
      wallEndpoint3D(cheek!, 'a', 280).h,
      wallEndpoint3D(cheek!, 'b', 280).h,
    ]
    expect(Math.min(...cheekTops)).toBeGreaterThanOrEqual(270)
    const slope = rightParts.find((w) => {
      const lo = Math.min(w.a.y, w.b.y)
      const hi = Math.max(w.a.y, w.b.y)
      return lo > 140 && lo < 200 && hi > 350 && hi < 450
    })
    expect(slope).toBeTruthy()
    expect(slope!.balance === 0 || slope!.balance === 1).toBe(false)
    const ridgeTops = [wallEndpoint3D(slope!, 'a', 280).h, wallEndpoint3D(slope!, 'b', 280).h]
    expect(ridgeTops).toContain(380)
    expect(Math.min(...ridgeTops)).toBeGreaterThan(300)
    const frontParts = result.plan.floors[0].walls.filter(
      (w) => w.id === 'front' || w.id.startsWith('front-split-'),
    )
    const kopse = frontParts.find((w) => {
      const lo = Math.min(w.a.x, w.b.x)
      const hi = Math.max(w.a.x, w.b.x)
      return lo > 200 && hi > 390
    })
    expect(kopse).toBeTruthy()
    expect(kopse!.balance === 0 || kopse!.balance === 1).toBe(true)
    for (const part of rightParts) {
      expect(part.a.x).toBeCloseTo(400, 5)
      expect(part.b.x).toBeCloseTo(400, 5)
    }
    expect(wallEndpoint3D(cheek!, 'a', 280).z).toBe(0)
  })
})

describe('bindFloorWallsToRoofs dakkapel-rand flush', () => {
  it('alleen kopse flusht; wang blijft 0.5 en aan de hoek gekoppeld', () => {
    const plan = createEmptyFloorPlan({ name: 'Kapel', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('front', { x: 100, y: 0 }, { x: 250, y: 0 }),
      wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 }),
    ]
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      makeRoofSurface({
        id: 'parent',
        origin: 'manual',
        poly: [
          { x: 0, y: 0, z: 280 },
          { x: 400, y: 0, z: 280 },
          { x: 400, y: 400, z: 400 },
          { x: 0, y: 400, z: 400 },
        ],
      }),
      makeRoofSurface({
        id: 'd1',
        origin: 'manual',
        roofKind: 'dormer',
        roofParentId: 'parent',
        poly: [
          { x: 100, y: 0, z: 280 },
          { x: 250, y: 0, z: 280 },
          { x: 250, y: 120, z: 320 },
          { x: 100, y: 120, z: 320 },
        ],
      }),
    ])
    const result = bindFloorWallsToRoofs(plan, 0)
    expect(result.flushedEdges).toBe(1)
    const front = result.plan.floors[0].walls.find((item) => item.id === 'front')!
    const wang = result.plan.floors[0].walls.find((item) => item.id === 'wang')!
    expect(front.balance === 0 || front.balance === 1).toBe(true)
    expect(wang.balance === 0 || wang.balance === 1).toBe(false)
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y)
    const welded =
      dist(front.a, wang.a) < 0.2 ||
      dist(front.a, wang.b) < 0.2 ||
      dist(front.b, wang.a) < 0.2 ||
      dist(front.b, wang.b) < 0.2
    expect(welded).toBe(true)
    expect(wang.a.x).toBeCloseTo(wang.b.x, 5)
    expect(front.a.y).toBeCloseTo(front.b.y, 5)
    expect(wallEndpoint3D(front, 'a', 280).h).toBeGreaterThanOrEqual(270)
    expect(wallEndpoint3D(wang, 'a', 280).h).toBeGreaterThanOrEqual(270)
    expect(wallEndpoint3D(wang, 'a', 280).z).toBeGreaterThanOrEqual(270)
  })

  it('ongedagde nested kapel: kopse {ouderZ, kindZ}, wang kind-top', () => {
    const plan = createEmptyFloorPlan({ name: 'Kapel', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('front', { x: 100, y: 0 }, { x: 250, y: 0 }),
      wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 }),
    ]
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      makeRoofSurface({
        id: 'parent',
        origin: 'manual',
        poly: [
          { x: 0, y: 0, z: 100 },
          { x: 400, y: 0, z: 100 },
          { x: 400, y: 400, z: 400 },
          { x: 0, y: 400, z: 400 },
        ],
      }),
      makeRoofSurface({
        id: 'd1',
        origin: 'manual',
        poly: [
          { x: 100, y: 0, z: 280 },
          { x: 250, y: 0, z: 280 },
          { x: 250, y: 120, z: 320 },
          { x: 100, y: 120, z: 320 },
        ],
      }),
    ])
    const result = bindFloorWallsToRoofs(plan, 0)
    const front = result.plan.floors[0].walls.find((item) => item.id === 'front')!
    const wang = result.plan.floors[0].walls.find((item) => item.id === 'wang')!
    expect(wallEndpoint3D(front, 'a', 280).z).toBeGreaterThanOrEqual(90)
    expect(wallEndpoint3D(front, 'a', 280).h).toBeGreaterThanOrEqual(270)
    expect(wallEndpoint3D(wang, 'a', 280).z).toBeGreaterThanOrEqual(90)
    expect(wallEndpoint3D(wang, 'a', 280).h).toBeGreaterThanOrEqual(270)
    expect(wang.balance === 0 || wang.balance === 1).toBe(false)
    expect(wang.a.x).toBeCloseTo(wang.b.x, 5)
  })

  it('syncDormerAssemblyAfterRoofEdit: goot-Z omhoog bindt kopse top zonder knop', () => {
    const plan = createEmptyFloorPlan({ name: 'Kapel-Z', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('front', { x: 100, y: 0 }, { x: 250, y: 0 }),
      wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 }),
    ]
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      makeRoofSurface({
        id: 'parent',
        origin: 'manual',
        poly: [
          { x: 0, y: 0, z: 100 },
          { x: 400, y: 0, z: 100 },
          { x: 400, y: 400, z: 400 },
          { x: 0, y: 400, z: 400 },
        ],
      }),
      makeRoofSurface({
        id: 'd1',
        origin: 'manual',
        roofKind: 'dormer',
        roofParentId: 'parent',
        poly: [
          { x: 100, y: 0, z: 280 },
          { x: 250, y: 0, z: 280 },
          { x: 250, y: 120, z: 320 },
          { x: 100, y: 120, z: 320 },
        ],
      }),
    ])
    // Eerst hoogtes op 280 (alsof al gebonden), daarna alleen dak-Z omhoog.
    const raised = setRidgeSurfaceVerticesZ(plan, 'd1', [0, 1], 340)
    expect(listRidgeSurfacesOnFloor(raised.floors[0]).find((s) => s.id === 'd1')!.poly[0]?.z).toBe(
      340,
    )
    expect(
      wallEndpoint3D(raised.floors[0].walls.find((w) => w.id === 'front')!, 'a', 280).h,
    ).toBe(280)

    const synced = syncDormerAssemblyAfterRoofEdit(raised, 'd1')
    const front = synced.floors[0].walls.find((w) => w.id === 'front')!
    const wang = synced.floors[0].walls.find((w) => w.id === 'wang')!
    expect(wallEndpoint3D(front, 'a', 280).h).toBe(340)
    expect(wallEndpoint3D(front, 'b', 280).h).toBe(340)
    expect(wallEndpoint3D(front, 'a', 280).z).toBeGreaterThanOrEqual(90)
    const wangFrontEnd =
      Math.abs(wang.a.y) < 1 ? 'a' : Math.abs(wang.b.y) < 1 ? 'b' : null
    expect(wangFrontEnd).not.toBeNull()
    expect(wallEndpoint3D(wang, wangFrontEnd!, 280).h).toBe(340)
  })

  it('sync na eerdere bind+flush: goot-Z blijft kopse bijwerken', () => {
    const plan = createEmptyFloorPlan({ name: 'Kapel-Z2', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('front', { x: 100, y: 0 }, { x: 250, y: 0 }),
      wall('wang', { x: 100, y: 0 }, { x: 100, y: 120 }),
    ]
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      makeRoofSurface({
        id: 'parent',
        origin: 'manual',
        poly: [
          { x: 0, y: 0, z: 100 },
          { x: 400, y: 0, z: 100 },
          { x: 400, y: 400, z: 400 },
          { x: 0, y: 400, z: 400 },
        ],
      }),
      makeRoofSurface({
        id: 'd1',
        origin: 'manual',
        roofKind: 'dormer',
        roofParentId: 'parent',
        poly: [
          { x: 100, y: 0, z: 280 },
          { x: 250, y: 0, z: 280 },
          { x: 250, y: 120, z: 320 },
          { x: 100, y: 120, z: 320 },
        ],
      }),
    ])
    const bound = bindFloorWallsToRoofs(plan, 0).plan
    expect(wallEndpoint3D(bound.floors[0].walls.find((w) => w.id === 'front')!, 'a', 280).h).toBe(
      280,
    )
    const raised = setRidgeSurfaceVerticesZ(bound, 'd1', [0, 1], 340)
    const synced = syncDormerAssemblyAfterRoofEdit(raised, 'd1')
    expect(wallEndpoint3D(synced.floors[0].walls.find((w) => w.id === 'front')!, 'a', 280).h).toBe(
      340,
    )
  })

  it('tweede bind is no-op: geen extra knip, muren blijven recht', () => {
    const plan = saddleWithCornerDormer()
    const once = bindFloorWallsToRoofs(plan, 0, {
      splitCreases: true,
    })
    expect(once.splits).toBeGreaterThan(0)
    const twice = bindFloorWallsToRoofs(once.plan, 0, {
      splitCreases: true,
    })
    expect(twice.splits).toBe(0)
    expect(twice.flushedEdges).toBe(0)
    expect(twice.boundJunctions).toBe(0)
    const before = once.plan.floors[0].walls
    const after = twice.plan.floors[0].walls
    expect(after.length).toBe(before.length)
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]!.a.x).toBeCloseTo(before[i]!.a.x, 5)
      expect(after[i]!.a.y).toBeCloseTo(before[i]!.a.y, 5)
      expect(after[i]!.b.x).toBeCloseTo(before[i]!.b.x, 5)
      expect(after[i]!.b.y).toBeCloseTo(before[i]!.b.y, 5)
    }
  })

  it('ongedagde kapel op kopgevel-rand: kopse kind-top, niet prefer-min 1cm', () => {
    const plan = createEmptyFloorPlan({ name: 'Kapel', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('front', { x: 250, y: 0 }, { x: 400, y: 0 }, { openings: [{ type: 'window', t: 0.5, width: 80, z: 90, z_height: 80, id: 'w1', kind: 'window.single' }] }),
      wall('wang-l', { x: 250, y: 0 }, { x: 250, y: 150 }),
      wall('wang-r', { x: 400, y: 0 }, { x: 400, y: 150 }),
      wall('gable', { x: 400, y: 150 }, { x: 400, y: 400 }),
    ]
    const parent = makeRoofSurface({
      id: 'parent',
      origin: 'manual',
      poly: [
        { x: 0, y: 0, z: 100 },
        { x: 400, y: 0, z: 100 },
        { x: 400, y: 400, z: 400 },
        { x: 0, y: 400, z: 400 },
      ],
    })
    const dormer = makeRoofSurface({
      id: 'd1',
      origin: 'manual',
      poly: [
        { x: 400, y: 0, z: 280 },
        { x: 400, y: 150, z: 280 },
        { x: 250, y: 150, z: 282 },
        { x: 250, y: 0, z: 280 },
      ],
    })
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [parent, dormer])
    const surfaces = plan.floors[0].designs?.find((d) => d.name === 'Dak')?.surfaces ?? []
    expect(isDormerLikeRoof(dormer, surfaces)).toBe(true)
    const ceiling = sampleCeilingRoofAtPoint(surfaces, { x: 325, y: 75 })
    expect(ceiling?.dormer).toBe(true)
    expect(ceiling?.z).toBeGreaterThanOrEqual(270)

    const result = bindFloorWallsToRoofs(plan, 0)
    const front = result.plan.floors[0].walls.find((item) => item.id === 'front')!
    const inner = result.plan.floors[0].walls.find((item) => item.id === 'wang-l')!
    const outer = result.plan.floors[0].walls.find((item) => item.id === 'wang-r')!
    expect(wallEndpoint3D(front, 'a', 280).h).toBeGreaterThanOrEqual(270)
    expect(wallEndpoint3D(front, 'a', 280).z).toBeGreaterThanOrEqual(90)
    expect(wallEndpoint3D(front, 'a', 280).h - wallEndpoint3D(front, 'a', 280).z).toBeGreaterThan(50)
    expect(wallEndpoint3D(inner, 'a', 280).z).toBeGreaterThanOrEqual(90)
    expect(wallEndpoint3D(inner, 'a', 280).h).toBeGreaterThanOrEqual(270)
    expect(wallEndpoint3D(outer, 'a', 280).z).toBeLessThan(5)
    expect(wallEndpoint3D(outer, 'a', 280).h).toBeGreaterThanOrEqual(270)
    expect(wallEndpoint3D(outer, 'b', 280).h).toBeGreaterThanOrEqual(270)

    const exported = JSON.parse(buildFmlV3(result.plan)) as {
      floors: Array<{ height: number; designs: Array<{ walls: Array<{ guid?: string; az?: { z: number; h: number } }> }> }>
    }
    const outFront = exported.floors[0]?.designs[0]?.walls.find((w) => w.guid === 'front')
    expect(outFront?.az?.h).toBeGreaterThanOrEqual(270)
    expect(outFront?.az?.z).toBeGreaterThanOrEqual(90)
    expect(outFront?.az?.z).toBeLessThan(150)
    expect((outFront?.az?.h ?? 0) - (outFront?.az?.z ?? 0)).toBeGreaterThan(50)
  })
})
