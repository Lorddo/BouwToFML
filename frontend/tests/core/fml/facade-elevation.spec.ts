import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  elevationRoofFillColor,
  elevationWallFillPoints,
  elevationWallInnerStrokes,
  hitElevationRoofPlane,
  hitElevationRoofVertex,
  openingOverlapRatio,
  openingPatchFromElevationRect,
  projectFacadeElevation,
  resolveElevationAxis,
  snapElevationAxisOrtho,
  snapElevationY,
  thickenElevationRoofPoly,
} from '@/core/fml/facade-elevation'
import { applyGeneratedRoofPlanes } from '@/core/fml/generate-roof-planes'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  roofSurfaceOrigin,
  setRidgeSurfaceVertexZ,
  setRidgeSurfacesOnFloor,
} from '@/core/fml/roof-planes'
import {
  assignWallsToGroup,
  createFacadeGroup,
  ensureStampFacadeGroup,
  hasElevationFacadeGroups,
  listElevationFacadeGroups,
} from '@/core/fml/facade-groups'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  DEFAULT_FLOOR_THICKNESS_CM,
  DEFAULT_NOK_THICKNESS_CM,
  floorWallBaseWorldZ,
  setNokThicknessCm,
  setSlabThicknessCm,
} from '@/core/fml/floor-stack'
import { setElevationProjection, setElevationViewDrawing } from '@/core/fml/elevation-views'
import { markWallAsRidge, ridgeEndpointExtras, setRidgeWallsOnFloor } from '@/core/fml/ridge-walls'
import {
  addPlanOpening,
  setPlanJunctionHeight,
  splitPlanWallAtT,
  updatePlanOpening,
} from '@/core/fml/elevation-openings'
import {
  CONCEPT_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  type FloorPlan,
  type Wall,
} from '@/core/fml/types'
import { makeEndpoint3D } from '@/core/fml/wall-endpoint-height'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

function twoFloorPlan(): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Elev', wallHeightCm: 280 })
  plan.floors[0].walls = [
    wall('front-bg', { x: 0, y: 0 }, { x: 400, y: 0 }),
    wall('return-bg', { x: 400, y: 0 }, { x: 400, y: 200 }),
  ]
  plan.floors.push(createBlankFloor({ name: '1e verdieping', level: 1, wallHeightCm: 280 }))
  plan.floors[1].walls = [wall('front-1e', { x: 0, y: 0 }, { x: 400, y: 0 })]
  const group = createFacadeGroup(plan, { name: 'Voorgevel', code: 'VG' })
  assignWallsToGroup(plan, group.id, ['front-bg', 'return-bg', 'front-1e'])
  return plan
}

describe('facade-elevation', () => {
  it('projecteert volle baksteen (buiten tot buiten) en laat return-wand vallen', () => {
    const plan = twoFloorPlan()
    const elev = projectFacadeElevation(plan, 'G1')
    expect(elev).not.toBeNull()
    const bg = elev!.walls.find((item) => item.wallId === 'front-bg')
    const ret = elev!.walls.find((item) => item.wallId === 'return-bg')
    expect(bg).toBeTruthy()
    expect(Math.abs(bg!.xb - bg!.xa)).toBeCloseTo(400, 5)
    expect(bg!.aTop.x).toBeCloseTo(bg!.xa - 10, 5)
    expect(bg!.bTop.x).toBeCloseTo(bg!.xb + 10, 5)
    expect(bg!.innerATop.x).toBeCloseTo(bg!.xa, 5)
    expect(bg!.innerBTop.x).toBeCloseTo(bg!.xb - 10, 5)
    expect(ret).toBeUndefined()
    expect(elev!.junctions.length).toBeGreaterThan(0)
    expect(elev!.junctions.some((item) => Math.abs(item.x - bg!.xa) < 1)).toBe(true)
    const fillXs = elevationWallFillPoints(bg!).map((point) => point.x)
    expect(fillXs).toContain(bg!.aTop.x)
    expect(fillXs).toContain(bg!.xa)
    expect(fillXs).toContain(bg!.xb)
    expect(fillXs).toContain(bg!.bTop.x)
    expect(elevationWallInnerStrokes(bg!).length).toBeGreaterThan(0)
  })

  it('schuine geveltop alleen tussen hartlijn; oren recht omhoog', () => {
    const plan = twoFloorPlan()
    const front = plan.floors[0]?.walls.find((item) => item.id === 'front-bg')
    front!.extras = { az: { z: 0, h: 200 }, bz: { z: 0, h: 280 } }
    const elev = projectFacadeElevation(plan, 'G1')
    const bg = elev!.walls.find((item) => item.wallId === 'front-bg')!
    const fill = elevationWallFillPoints(bg)
    expect(bg.aTop.x).toBeCloseTo(bg.xa - 10, 5)
    expect(bg.bTop.x).toBeCloseTo(bg.xb + 10, 5)
    expect(bg.aTop.y).not.toBeCloseTo(bg.bTop.y, 5)
    const atAxisA = fill.find((point) => Math.abs(point.x - bg.xa) < 0.5)
    const atAxisB = fill.find((point) => Math.abs(point.x - bg.xb) < 0.5)
    expect(atAxisA?.y).toBeCloseTo(bg.aTop.y, 5)
    expect(atAxisB?.y).toBeCloseTo(bg.bTop.y, 5)
  })

  it('split + junction-hoogte maakt een knik in het aanzicht', () => {
    const plan = twoFloorPlan()
    const split = splitPlanWallAtT(plan, 'front-bg', 0.5)
    expect(split).not.toBeNull()
    const group = split!.plan.source?.settings?.facadeGroups?.find((item) => item.id === 'G1')
    expect(group?.wallGuids).toEqual(expect.arrayContaining(['front-bg', split!.secondWallId]))
    const elev = projectFacadeElevation(split!.plan, 'G1')
    const mid = elev!.junctions.find((item) => item.floorIndex === 0 && Math.abs(item.x - 200) < 1)
    expect(mid).toBeTruthy()
    const next = setPlanJunctionHeight(split!.plan, mid!.floorIndex, mid!.refs, 160)
    const again = projectFacadeElevation(next, 'G1')
    const updated = again!.junctions.find((item) => item.id === mid!.id)
    expect(updated?.heightCm).toBe(160)
  })

  it('junction-hoogtes maken een schuine geveltop (az.h ≠ bz.h)', () => {
    const plan = twoFloorPlan()
    const front = plan.floors[0]?.walls.find((item) => item.id === 'front-bg')
    expect(front).toBeTruthy()
    front!.extras = {
      az: { z: 0, h: 280 },
      bz: { z: 0, h: 0 },
    }
    const elev = projectFacadeElevation(plan, 'G1')
    const bg = elev!.walls.find((item) => item.wallId === 'front-bg')
    expect(bg).toBeTruthy()
    expect(bg!.aTop.y).toBeCloseTo(-300, 5)
    expect(bg!.bTop.y).toBeCloseTo(-20, 5)
    expect(bg!.aBottom.y).toBeCloseTo(-20, 5)
    expect(bg!.bBottom.y).toBeCloseTo(-20, 5)
  })

  it('stack: BG-plaat 20 + 280 + 1e-plaat 20 → 1e-muurvoet op world-Z 320', () => {
    const plan = twoFloorPlan()
    expect(DEFAULT_FLOOR_THICKNESS_CM).toBe(20)
    expect(floorWallBaseWorldZ(plan, 0)).toBe(20)
    expect(floorWallBaseWorldZ(plan, 1)).toBe(320)
    const elev = projectFacadeElevation(plan, 'G1')
    const first = elev!.walls.find((item) => item.wallId === 'front-1e')
    expect(first).toBeTruthy()
    expect(first!.y1).toBeCloseTo(-320, 5)
    expect(first!.y0).toBeCloseTo(-600, 5)
  })

  it('raam mag tot de buitenkant (voorbij hartlijn-einde)', () => {
    const plan = twoFloorPlan()
    const elev = projectFacadeElevation(plan, 'G1')
    const wall = elev!.walls.find((item) => item.wallId === 'front-bg')!
    const flushRight = {
      x0: wall.bTop.x - 80,
      x1: wall.bTop.x,
      y0: -200,
      y1: -80,
    }
    const patch = openingPatchFromElevationRect(wall, flushRight, 20)
    expect(wall.bTop.x).toBeGreaterThan(wall.xb + 5)
    expect(patch.width).toBe(80)
    expect(patch.t).toBeCloseTo((wall.bTop.x - 40 - wall.xa) / 400, 5)
  })

  it('opening blijft onder verdiepingshoogte bij update', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'window',
      refid: CONCEPT_WINDOW_REFID,
      t: 0.5,
      width: 80,
      z: 200,
      z_height: 200,
      guid: 'win-clamp',
    })
    const located = added.plan.floors[0]?.walls
      .find((item) => item.id === 'front-bg')
      ?.openings.find((item) => item.guid === 'win-clamp')
    expect(located).toBeTruthy()
    expect((located!.z ?? 0) + (located!.z_height ?? 0)).toBeLessThanOrEqual(280)
  })

  it('opening GUID blijft bij dorpel-sleep', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'window',
      refid: CONCEPT_WINDOW_REFID,
      t: 0.4,
      width: 80,
      z: 100,
      z_height: 140,
      guid: 'win-guid-1',
    })
    expect(added.openingId).toBeTruthy()
    const elev = projectFacadeElevation(added.plan, 'G1')
    const rect = elev!.openings.find((item) => item.openingGuid === 'win-guid-1')
    expect(rect).toBeTruthy()
    const wall = elev!.walls.find((item) => item.wallId === 'front-bg')!
    const shifted = {
      x0: rect!.x0,
      x1: rect!.x1,
      y0: rect!.y0 + 20,
      y1: rect!.y1 + 20,
    }
    const patch = openingPatchFromElevationRect(wall, shifted, 20)
    expect(patch.z).toBe(80)
    expect(patch.z_height).toBe(140)
    const next = updatePlanOpening(added.plan, added.openingId!, { z: patch.z })
    const again = projectFacadeElevation(next, 'G1')
    const updated = again!.openings.find((item) => item.openingGuid === 'win-guid-1')
    expect(updated).toBeTruthy()
    expect(updated!.openingId).toBe(added.openingId)
  })

  it('polygoon-overlap >50% koppelt aan bestaande GUID', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-guid-1',
    })
    const elev = projectFacadeElevation(added.plan, 'G1')
    const rect = elev!.openings[0]
    const inner = {
      x0: rect.x0 + 5,
      x1: rect.x1 - 5,
      y0: rect.y0 + 5,
      y1: rect.y1 - 5,
    }
    expect(openingOverlapRatio(inner, rect)).toBeGreaterThan(0.5)
  })

  it('hasElevationFacadeGroups negeert stamp; extras roundtrip', () => {
    const plan = twoFloorPlan()
    ensureStampFacadeGroup(plan)
    expect(hasElevationFacadeGroups(plan)).toBe(true)
    expect(listElevationFacadeGroups(plan).map((g) => g.id)).toEqual(['G1'])

    const withStack = setNokThicknessCm(setSlabThicknessCm(plan, 1, 25), 40)
    const withDraw = setElevationViewDrawing(withStack, 'G1', {
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      rotation: 0,
      url: 'data:image/png;base64,xx',
    })
    const json = buildFmlV3(withDraw)
    expect(json).toContain('floorStack')
    expect(json).toContain('elevationViews')
    const imported = importFmlV3(json)
    expect(imported.plan.source?.settings?.floorStack).toMatchObject({
      nokThicknessCm: 40,
      floors: expect.arrayContaining([{ level: 1, thicknessCm: 25 }]),
    })
    expect(imported.plan.source?.settings?.elevationViews).toEqual([
      expect.objectContaining({ facadeGroupId: 'G1' }),
    ])
    expect(DEFAULT_NOK_THICKNESS_CM).toBe(30)
  })

  it('architect snapt schuine gevelas naar H/V; projectief houdt de schuinte', () => {
    const slanted = [wall('s1', { x: 0, y: 0 }, { x: 400, y: 80 })]
    const arch = resolveElevationAxis(slanted, 'architect')
    const proj = resolveElevationAxis(slanted, 'projective')
    expect(arch).toEqual({ x: 1, y: 0 })
    expect(proj).not.toBeNull()
    expect(Math.abs(proj!.y)).toBeGreaterThan(0.1)
    expect(snapElevationAxisOrtho(proj!)).toEqual({ x: 1, y: 0 })
  })

  it('projectief maakt de nokbalk dikker op een schuine kopgevel', () => {
    const plan = createEmptyFloorPlan({ name: 'Scheef' })
    plan.floors[0].walls = [wall('gable', { x: 0, y: 0 }, { x: 0, y: 200 })]
    plan.floors[0].walls[0] = wall('gable', { x: 0, y: 0 }, { x: 40, y: 200 })
    const group = createFacadeGroup(plan, { name: 'Kop' })
    assignWallsToGroup(plan, group.id, ['gable'])
    const ridge = markWallAsRidge(
      wall('r1', { x: 0, y: 100 }, { x: 400, y: 100 }),
      ridgeEndpointExtras(280, 20, 350),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])

    const archPlan = setElevationProjection(plan, 'architect')
    const projPlan = setElevationProjection(plan, 'projective')
    const archRidge = projectFacadeElevation(archPlan, group.id)!.walls.find((item) => item.ridge)
    const projRidge = projectFacadeElevation(projPlan, group.id)!.walls.find((item) => item.ridge)
    expect(archRidge).toBeTruthy()
    expect(projRidge).toBeTruthy()
    expect(archRidge!.x1 - archRidge!.x0).toBeCloseTo(10, 5)
    expect(projRidge!.x1 - projRidge!.x0).toBeGreaterThan(20)
  })

  it('dakvlak-punten op de goot blijven op de buitenhoek, niet de muurhartlijn', () => {
    const plan = twoFloorPlan()
    const front = plan.floors[0]?.walls.find((item) => item.id === 'front-bg')
    front!.extras = { az: { z: 0, h: 280 }, bz: { z: 0, h: 200 } }
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      makeRoofSurface({
        id: 'roof-front',
        origin: 'manual',
        poly: [
          { x: -10, y: -10, z: 280 },
          { x: 410, y: -10, z: 200 },
          { x: 400, y: 200, z: 350 },
          { x: 0, y: 200, z: 350 },
        ],
      }),
    ])
    const elev = projectFacadeElevation(plan, 'G1')
    const plane = elev!.roofPlanes[0]
    expect(plane).toBeTruthy()
    const wall = elev!.walls.find((item) => item.wallId === 'front-bg')!
    const xs = plane.points.map((point) => point.x)
    expect(Math.min(...xs)).toBeCloseTo(-10, 5)
    expect(Math.max(...xs)).toBeCloseTo(410, 5)
    expect(Math.min(...xs)).toBeCloseTo(Math.min(wall.aTop.x, wall.bTop.x), 5)
    expect(Math.max(...xs)).toBeCloseTo(Math.max(wall.aTop.x, wall.bTop.x), 5)
  })

  it('dakvlak-goot op buitenhoek blijft breed als alleen die gevel een zolder-muur heeft', () => {
    const H = 240
    const thick = (
      id: string,
      a: { x: number; y: number },
      b: { x: number; y: number },
      height = H,
    ): Wall => ({
      id,
      a,
      b,
      thickness: 28,
      openings: [],
      extras: { az: makeEndpoint3D(0, height), bz: makeEndpoint3D(0, height) },
    })
    const plan = createEmptyFloorPlan({ name: 'Achter-goot', wallHeightCm: H })
    plan.floors[0].walls = [
      thick('front-0', { x: -599, y: -804 }, { x: 14, y: -804 }),
      thick('back-0', { x: -599, y: 14 }, { x: 14, y: 14 }),
      thick('west-0', { x: -599, y: -804 }, { x: -599, y: 14 }),
      thick('east-0', { x: 14, y: -804 }, { x: 14, y: 14 }),
    ]
    plan.floors.push(createBlankFloor({ name: 'Zolder', level: 1, wallHeightCm: 1 }))
    plan.floors[1].walls = [thick('front-z', { x: -599, y: -804 }, { x: 14, y: -804 }, 1)]
    const front = createFacadeGroup(plan, { name: 'Achter' })
    const back = createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, front.id, ['front-0', 'front-z'])
    assignWallsToGroup(plan, back.id, ['back-0'])
    plan.floors[1] = setRidgeSurfacesOnFloor(plan.floors[1], [
      makeRoofSurface({
        id: 'roof-achter',
        origin: 'manual',
        poly: [
          { x: -613, y: -818, z: 0 },
          { x: 28, y: -821, z: 0 },
          { x: 28, y: -399, z: 270 },
          { x: -613, y: -399, z: 270 },
        ],
      }),
    ])
    const elev = projectFacadeElevation(plan, front.id)
    const plane = elev!.roofPlanes[0]
    expect(plane).toBeTruthy()
    const xs = plane.points.map((point) => point.x)
    expect(Math.min(...xs)).toBeCloseTo(-613, 5)
    expect(Math.max(...xs)).toBeCloseTo(28, 5)
    const brick = elev!.walls.find((item) => item.wallId === 'front-z')
    expect(brick).toBeTruthy()
    expect(Math.min(brick!.aTop.x, brick!.bTop.x)).toBeLessThan(-605)
    expect(Math.max(brick!.aTop.x, brick!.bTop.x)).toBeGreaterThan(20)
  })

  it('dakvlak: alleen het vlak dat de gevel raakt, grijs per gevel', () => {
    const H = 260
    const end = makeEndpoint3D(0, H)
    const thick = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall => ({
      id,
      a,
      b,
      thickness: 20,
      openings: [],
      extras: { az: end, bz: { ...end } },
    })
    const plan = createEmptyFloorPlan({ name: 'Dakgevels', wallHeightCm: H })
    plan.floors[0].walls = [
      thick('south', { x: 0, y: 0 }, { x: 800, y: 0 }),
      thick('east', { x: 800, y: 0 }, { x: 800, y: 800 }),
      thick('north', { x: 800, y: 800 }, { x: 0, y: 800 }),
      thick('west', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const south = createFacadeGroup(plan, { name: 'Zuid' })
    const east = createFacadeGroup(plan, { name: 'Oost' })
    const north = createFacadeGroup(plan, { name: 'Noord' })
    const west = createFacadeGroup(plan, { name: 'West' })
    assignWallsToGroup(plan, south.id, ['south'])
    assignWallsToGroup(plan, east.id, ['east'])
    assignWallsToGroup(plan, north.id, ['north'])
    assignWallsToGroup(plan, west.id, ['west'])
    const ridge = markWallAsRidge(
      thick('r1', { x: 0, y: 400 }, { x: 800, y: 400 }),
      ridgeEndpointExtras(H, 20, 450),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const withRoofs = applyGeneratedRoofPlanes(plan, 0)

    const elevS = projectFacadeElevation(withRoofs, south.id)
    const elevN = projectFacadeElevation(withRoofs, north.id)
    const elevE = projectFacadeElevation(withRoofs, east.id)
    const elevW = projectFacadeElevation(withRoofs, west.id)
    expect(elevS?.roofPlanes).toHaveLength(1)
    expect(elevN?.roofPlanes).toHaveLength(1)
    expect(elevS!.roofPlanes[0].id).not.toBe(elevN!.roofPlanes[0].id)
    expect(elevS!.roofPlanes[0].color).toBe(elevationRoofFillColor(south.id, 0))
    expect(elevN!.roofPlanes[0].color).toBe(elevationRoofFillColor(north.id, 2))
    expect(elevS!.roofPlanes[0].color).not.toBe(elevN!.roofPlanes[0].color)
    expect(elevE?.roofPlanes).toHaveLength(2)
    expect(elevW?.roofPlanes).toHaveLength(2)
    expect(elevS!.walls.filter((item) => !item.ridge).map((item) => item.wallId)).toEqual(['south'])
    for (const plane of [...elevE!.roofPlanes, ...elevW!.roofPlanes]) {
      expect(plane.fillPoints.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('dakvlak in aanzicht: nokdikte om het hart, handles blijven op het vlak', () => {
    const H = 260
    const end = makeEndpoint3D(0, H)
    const thick = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall => ({
      id,
      a,
      b,
      thickness: 20,
      openings: [],
      extras: { az: end, bz: { ...end } },
    })
    const plan = setNokThicknessCm(createEmptyFloorPlan({ name: 'Dakplaat', wallHeightCm: H }), 40)
    plan.floors[0].walls = [
      thick('south', { x: 0, y: 0 }, { x: 800, y: 0 }),
      thick('east', { x: 800, y: 0 }, { x: 800, y: 800 }),
      thick('north', { x: 800, y: 800 }, { x: 0, y: 800 }),
      thick('west', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const south = createFacadeGroup(plan, { name: 'Zuid' })
    assignWallsToGroup(plan, south.id, ['south'])
    const ridge = markWallAsRidge(
      thick('r1', { x: 0, y: 400 }, { x: 800, y: 400 }),
      ridgeEndpointExtras(H, 40, 450),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const withRoofs = applyGeneratedRoofPlanes(plan, 0)
    const elev = projectFacadeElevation(withRoofs, south.id)
    const plane = elev!.roofPlanes[0]
    expect(plane.points.length).toBeGreaterThanOrEqual(3)
    expect(plane.fillPoints.length).toBeGreaterThanOrEqual(3)
    const topMinY = Math.min(...plane.points.map((point) => point.y))
    const fillMinY = Math.min(...plane.fillPoints.map((point) => point.y))
    const fillMaxY = Math.max(...plane.fillPoints.map((point) => point.y))
    const hartMaxY = Math.max(...plane.points.map((point) => point.y))
    expect(fillMinY).toBeCloseTo(topMinY - 20, 5)
    expect(fillMaxY).toBeCloseTo(hartMaxY + 20, 5)
    expect(hitElevationRoofVertex(plane, plane.points[0])).toBe(0)
    const aboveTop = { x: plane.points[0].x, y: plane.points[0].y - 20 }
    expect(hitElevationRoofPlane(elev!, aboveTop)?.id).toBe(plane.id)
  })

  it('thickenElevationRoofPoly: dikte 0 laat de ring ongewijzigd', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    expect(thickenElevationRoofPoly(ring, 0)).toEqual(ring)
    const thick = thickenElevationRoofPoly(ring, 12)
    expect(Math.min(...thick.map((p) => p.y))).toBe(-6)
    expect(Math.max(...thick.map((p) => p.y))).toBe(16)
  })

  it('thickenElevationRoofPoly: kopse lijn wordt een plaat om het hart', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: -80 },
    ]
    const thick = thickenElevationRoofPoly(line, 20)
    expect(thick.length).toBeGreaterThanOrEqual(3)
    expect(Math.min(...thick.map((p) => p.y))).toBeCloseTo(-90, 5)
    expect(Math.max(...thick.map((p) => p.y))).toBeCloseTo(10, 5)
  })

  it('dakvlak: geen projectie van zijgevels die het vlak raken', () => {
    const H = 280
    const thick = (
      id: string,
      a: { x: number; y: number },
      b: { x: number; y: number },
      ha: number,
      hb: number,
    ): Wall => ({
      id,
      a,
      b,
      thickness: 20,
      openings: [],
      extras: { az: makeEndpoint3D(0, ha), bz: makeEndpoint3D(0, hb) },
    })
    const plan = createEmptyFloorPlan({ name: 'Sprong', wallHeightCm: H })
    plan.floors[0].walls = [
      thick('north', { x: -10, y: 400 }, { x: 400, y: 400 }, 1, 1),
      thick('step', { x: -10, y: 200 }, { x: 80, y: 200 }, H, H),
      thick('west-low', { x: -10, y: 400 }, { x: -10, y: 200 }, 1, H),
      thick('east-rake', { x: 400, y: 400 }, { x: 360, y: 0 }, 1, 400),
    ]
    const north = createFacadeGroup(plan, { name: 'Voor' })
    assignWallsToGroup(plan, north.id, ['north'])
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [
      makeRoofSurface({
        id: 'roof-n',
        origin: 'manual',
        poly: [
          { x: 80, y: 0, z: 400 },
          { x: 360, y: 0, z: 400 },
          { x: 400, y: 400, z: 1 },
          { x: -10, y: 400, z: 1 },
          { x: -10, y: 200, z: H },
          { x: 80, y: 200, z: H },
        ],
      }),
    ])

    const elev = projectFacadeElevation(plan, north.id)
    const ids = elev!.walls.filter((item) => !item.ridge).map((item) => item.wallId)
    expect(ids).toEqual(['north'])
    expect(elev!.roofPlanes).toHaveLength(1)
  })

  it('dakvlak in aanzicht: punt-hit + alleen Z verslepen', () => {
    const H = 260
    const end = makeEndpoint3D(0, H)
    const thick = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall => ({
      id,
      a,
      b,
      thickness: 20,
      openings: [],
      extras: { az: end, bz: { ...end } },
    })
    const plan = createEmptyFloorPlan({ name: 'Dakedit', wallHeightCm: H })
    plan.floors[0].walls = [
      thick('south', { x: 0, y: 0 }, { x: 800, y: 0 }),
      thick('east', { x: 800, y: 0 }, { x: 800, y: 800 }),
      thick('north', { x: 800, y: 800 }, { x: 0, y: 800 }),
      thick('west', { x: 0, y: 800 }, { x: 0, y: 0 }),
    ]
    const south = createFacadeGroup(plan, { name: 'Zuid' })
    assignWallsToGroup(plan, south.id, ['south'])
    const ridge = markWallAsRidge(
      thick('r1', { x: 0, y: 400 }, { x: 800, y: 400 }),
      ridgeEndpointExtras(H, 20, 450),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const withRoofs = applyGeneratedRoofPlanes(plan, 0)
    const elev = projectFacadeElevation(withRoofs, south.id)
    const plane = elev!.roofPlanes[0]
    expect(plane).toBeTruthy()
    expect(plane.floorIndex).toBe(0)

    const mid = {
      x: plane.points.reduce((sum, point) => sum + point.x, 0) / plane.points.length,
      y: plane.points.reduce((sum, point) => sum + point.y, 0) / plane.points.length,
    }
    expect(hitElevationRoofPlane(elev!, mid)?.id).toBe(plane.id)
    expect(hitElevationRoofPlane(elev!, { x: mid.x, y: mid.y + 400 })).toBeNull()
    expect(hitElevationRoofVertex(plane, plane.points[0])).toBe(0)

    const peak = plane.points.reduce(
      (best, point, index) => (point.y < best.y ? { index, y: point.y } : best),
      { index: 0, y: plane.points[0].y },
    )
    const before = listRidgeSurfacesOnFloor(withRoofs.floors[0]).find(
      (surface) => surface.id === plane.id,
    )
    const next = setRidgeSurfaceVertexZ(
      withRoofs,
      plane.id,
      peak.index,
      (before?.poly[peak.index]?.z ?? 0) + 50,
    )
    const afterSurface = listRidgeSurfacesOnFloor(next.floors[0]).find(
      (surface) => surface.id === plane.id,
    )
    expect(roofSurfaceOrigin(afterSurface)).toBe('manual')
    const elevNext = projectFacadeElevation(next, south.id)
    const moved = elevNext!.roofPlanes[0].points[peak.index]
    const origin = plane.points[peak.index]
    expect(moved.x).toBeCloseTo(origin.x, 5)
    expect(moved.y).toBeCloseTo(origin.y - 50, 5)
    const xy = before!.poly[peak.index]
    const after = afterSurface?.poly[peak.index]
    expect(after?.x).toBe(xy.x)
    expect(after?.y).toBe(xy.y)
    expect(snapElevationY(-450, [-400, -500], 8)).toBe(-450)
    expect(snapElevationY(-403, [-400, -500], 8)).toBe(-400)
  })
})
