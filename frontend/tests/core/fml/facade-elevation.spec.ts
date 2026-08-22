import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  elevationRoofFillColor,
  projectFacadeElevation,
  resolveElevationAxis,
  snapElevationAxisOrtho,
  thickenElevationRoofPoly,
} from '@/core/fml/facade-elevation'
import {
  collectElevationSplitSnapXs,
  elevationSplitPreviewAt,
  hitElevationOpening,
  hitElevationRoofPlane,
  hitElevationRoofVertex,
  hitElevationWall,
  nearestElevationRidgeJunction,
  openingOverlapRatio,
  openingPatchFromElevationRect,
  snapElevationY,
} from '@/core/fml/elevation-hit'
import {
  elevationWallFillPoints,
  elevationWallFillRings,
  elevationWallInnerStrokes,
  groupElevationPaintPlanes,
} from '@/core/fml/elevation-paint'
import { glyphFromElevationRect } from '@/core/fml/elevation-opening-symbol'
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
  listFacadeGroups,
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
import {
  markWallAsRidge,
  ridgeEndpointExtras,
  setPlanRidgeJunctionZ,
  setRidgeWallsOnFloor,
} from '@/core/fml/ridge-walls'
import {
  addPlanOpening,
  setPlanJunctionHeight,
  splitPlanWallAtT,
  updatePlanOpening,
} from '@/core/fml/elevation-openings'
import { splitWallAtT } from '@/ui/components/fml-preview-wall-edit'
import {
  CONCEPT_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  WINDOW_DOUBLE_REFID,
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
  it('vloerband volgt alleen de gevelmuren van die floor', () => {
    const plan = createEmptyFloorPlan({ name: 'Slab', wallHeightCm: 250 })
    plan.floors[0].walls = [wall('bg-side', { x: 0, y: 0 }, { x: 0, y: 800 })]
    plan.floors.push(createBlankFloor({ name: '1e', level: 1, wallHeightCm: 250 }))
    plan.floors[1].walls = [wall('up-side', { x: 0, y: 0 }, { x: 0, y: 400 })]
    const group = createFacadeGroup(plan, { name: 'Zijgevel', code: 'ZG' })
    assignWallsToGroup(plan, group.id, ['bg-side', 'up-side'])
    const elev = projectFacadeElevation(plan, group.id)
    const slabs = elev!.bands.filter((band) => band.kind === 'slab')
    const bg = slabs.find((band) => band.floorIndex === 0)!
    const up = slabs.find((band) => band.floorIndex === 1)!
    expect(Math.abs(bg.x1 - bg.x0)).toBeGreaterThan(Math.abs(up.x1 - up.x0) + 50)
  })

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
    const split = splitPlanWallAtT(plan, 'front-bg', 0.5, splitWallAtT)
    expect(split).not.toBeNull()
    const group = listFacadeGroups(split!.plan).find((item) => item.id === 'G1')
    expect(group?.wallGuids).toEqual(expect.arrayContaining(['front-bg', split!.secondWallId]))
    const elev = projectFacadeElevation(split!.plan, 'G1')
    const mid = elev!.junctions.find((item) => item.floorIndex === 0 && Math.abs(item.x - 200) < 1)
    expect(mid).toBeTruthy()
    const next = setPlanJunctionHeight(split!.plan, mid!.floorIndex, mid!.refs, 160)
    const again = projectFacadeElevation(next, 'G1')
    const updated = again!.junctions.find((item) => item.id === mid!.id)
    expect(updated?.heightCm).toBe(160)
  })

  it('nokbalk krijgt eigen junctions; hoogte-edit verschuift de balk', () => {
    const plan = twoFloorPlan()
    const ridge = markWallAsRidge(
      wall('ridge-1', { x: 0, y: 80 }, { x: 400, y: 80 }),
      ridgeEndpointExtras(280, 20, 350),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elev = projectFacadeElevation(plan, 'G1')
    const ridgeWall = elev!.walls.find((item) => item.wallId === 'ridge-1')
    expect(ridgeWall?.ridge).toBe(true)
    const ridgeJunctions = elev!.junctions.filter((item) => item.ridge)
    expect(ridgeJunctions.length).toBeGreaterThanOrEqual(2)
    expect(ridgeJunctions.every((item) => item.heightCm === 350)).toBe(true)
    const left = nearestElevationRidgeJunction(elev!, ridgeWall!, {
      x: ridgeWall!.xa,
      y: (ridgeWall!.y0 + ridgeWall!.y1) / 2,
    })
    expect(left).toBeTruthy()
    const next = setPlanRidgeJunctionZ(plan, left!.floorIndex, left!.refs, 480)
    const again = projectFacadeElevation(next, 'G1')
    const updated = again!.junctions.find((item) => item.id === left!.id)
    expect(updated?.heightCm).toBe(480)
    const other = again!.junctions.find((item) => item.ridge && item.id !== left!.id)
    expect(other?.heightCm).toBe(350)
  })

  it('kopse nokbalk is endOn en heeft geen knooplijn', () => {
    const plan = twoFloorPlan()
    const ridge = markWallAsRidge(
      wall('ridge-end', { x: 200, y: 0 }, { x: 200, y: 200 }),
      ridgeEndpointExtras(280, 20, 350),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elev = projectFacadeElevation(plan, 'G1')
    const ridgeWall = elev!.walls.find((item) => item.wallId === 'ridge-end')
    expect(ridgeWall?.endOn).toBe(true)
    expect(elev!.junctions.some((item) => item.ridge)).toBe(false)
    const planes = groupElevationPaintPlanes(elev!)
    expect(planes.some((plane) => plane.walls.some((item) => item.wallId === 'ridge-end'))).toBe(
      false,
    )
    expect(
      planes.some((plane) => plane.endOnRidges.some((item) => item.wallId === 'ridge-end')),
    ).toBe(true)
  })

  it('split-preview snapt op een andere knoop binnen het segment', () => {
    const plan = twoFloorPlan()
    const elev = projectFacadeElevation(plan, 'G1')!
    const wall = elev.walls.find((item) => item.wallId === 'front-bg')!
    const preview = elevationSplitPreviewAt(wall, 196, [200, 0, 400])
    expect(preview.snapped).toBe(true)
    expect(preview.x).toBeCloseTo(200, 0)
    const snapXs = collectElevationSplitSnapXs(elev, wall.wallId)
    expect(snapXs.every((x) => Math.abs(x - wall.xa) > 1 && Math.abs(x - wall.xb) > 1)).toBe(true)
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

  it('type-wijziging op bg raakt niet het raam op 1e bij dezelfde muur-id', () => {
    const plan = createEmptyFloorPlan({ name: 'Leak', wallHeightCm: 280 })
    plan.floors[0].walls = [wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })]
    plan.floors.push(createBlankFloor({ name: '1e verdieping', level: 1, wallHeightCm: 280 }))
    plan.floors[1].walls = [wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })]
    const group = createFacadeGroup(plan, { name: 'Voorgevel', code: 'VG' })
    assignWallsToGroup(plan, group.id, ['front'])
    const bg = addPlanOpening(
      plan,
      'front',
      {
        type: 'window',
        refid: CONCEPT_WINDOW_REFID,
        t: 0.5,
        width: 100,
        z: 80,
        z_height: 140,
        guid: 'shared-win',
      },
      0,
    )
    const both = addPlanOpening(
      bg.plan,
      'front',
      {
        type: 'window',
        refid: CONCEPT_WINDOW_REFID,
        t: 0.5,
        width: 100,
        z: 80,
        z_height: 140,
        guid: 'shared-win',
      },
      1,
    )
    const elev = projectFacadeElevation(both.plan, group.id)
    const bgRect = elev!.openings.find((item) => item.floorIndex === 0)
    const upRect = elev!.openings.find((item) => item.floorIndex === 1)
    expect(bgRect?.openingId).toBe(bg.openingId)
    expect(upRect?.openingId).toBe(both.openingId)
    expect(bgRect?.openingId).not.toBe(upRect?.openingId)

    const next = updatePlanOpening(both.plan, bg.openingId!, { refid: WINDOW_DOUBLE_REFID })
    expect(next.floors[0]?.walls[0]?.openings[0]?.refid).toBe(WINDOW_DOUBLE_REFID)
    expect(next.floors[1]?.walls[0]?.openings[0]?.refid).toBe(CONCEPT_WINDOW_REFID)
  })

  it('schrijft mirrored alleen op de geklikte floor-deur', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-mirror',
      mirrored: [0, 0],
    })
    const next = updatePlanOpening(added.plan, added.openingId!, { mirrored: [1, 1] })
    expect(next.floors[0]?.walls[0]?.openings[0]?.mirrored).toEqual([1, 1])
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

  it('bovenlicht-flag: groen vlak boven de deur met juiste Z', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-transom',
      bovenlicht: true,
      bovenlichtHeightCm: 20,
      bovenlichtGapCm: 0,
    })
    const elev = projectFacadeElevation(added.plan, 'G1')
    expect(elev!.openings).toHaveLength(1)
    expect(elev!.transoms).toHaveLength(1)
    const door = elev!.openings[0]
    const transom = elev!.transoms[0]
    expect(transom.openingId).toBe(door.openingId)
    expect(transom.x0).toBeCloseTo(door.x0, 5)
    expect(transom.x1).toBeCloseTo(door.x1, 5)
    // Gap 0: onderkant bovenlicht = bovenzijde deur; hoogte 20 cm (Y = −worldZ).
    expect(transom.y1).toBeCloseTo(door.y0, 5)
    expect(transom.y0).toBeCloseTo(door.y0 - 20, 5)
    expect(transom.refid).toBe(CONCEPT_WINDOW_REFID)
    const glyph = glyphFromElevationRect(transom)
    expect(glyph.inner.x1 - glyph.inner.x0).toBeLessThan(transom.x1 - transom.x0)
    expect(glyph.inner.y1 - glyph.inner.y0).toBeLessThan(transom.y1 - transom.y0)
  })

  it('bovenlicht: flag uit + default uit → geen transom', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-no-transom',
      bovenlicht: false,
    })
    const elev = projectFacadeElevation(added.plan, 'G1', () => ({
      doorDefault: false,
      windowDefault: false,
      heightCm: 40,
      gapCm: 10,
    }))
    expect(elev!.transoms).toHaveLength(0)
  })

  it('bovenlicht: default aan zonder override → wel transom', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-default-transom',
    })
    const elev = projectFacadeElevation(added.plan, 'G1', () => ({
      doorDefault: true,
      windowDefault: false,
      heightCm: 40,
      gapCm: 10,
    }))
    expect(elev!.transoms).toHaveLength(1)
    const door = elev!.openings[0]
    const transom = elev!.transoms[0]
    // gap 10 + height 40 onder de muurtop
    expect(transom.y1).toBeCloseTo(door.y0 - 10, 5)
    expect(transom.y0).toBeCloseTo(door.y0 - 10 - 40, 5)
    expect(transom.openingId).toBe(door.openingId)
  })

  it('hitElevationOpening in transom-rect geeft de ouder-deur', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-hit-transom',
      bovenlicht: true,
      bovenlichtHeightCm: 20,
      bovenlichtGapCm: 0,
    })
    const elev = projectFacadeElevation(added.plan, 'G1')!
    const transom = elev.transoms[0]
    const mid = {
      x: (transom.x0 + transom.x1) / 2,
      y: (transom.y0 + transom.y1) / 2,
    }
    const hit = hitElevationOpening(elev, mid)
    expect(hit?.openingId).toBe(elev.openings[0].openingId)
    expect(hit?.type).toBe('door')
  })

  it('twee parallelle gevels: buitenste muur en opening liggen vóór de achtergevel', () => {
    const plan = createEmptyFloorPlan({ name: 'Stack', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('voorgevel', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('achter', { x: 0, y: 400 }, { x: 400, y: 400 }),
      wall('serre', { x: 0, y: 560 }, { x: 400, y: 560 }),
      wall('zij-l', { x: 0, y: 0 }, { x: 0, y: 560 }),
      wall('zij-r', { x: 400, y: 0 }, { x: 400, y: 560 }),
    ]
    const group = createFacadeGroup(plan, { name: 'Achter', code: 'A' })
    assignWallsToGroup(plan, group.id, ['achter', 'serre'])
    const rear = addPlanOpening(plan, 'achter', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-achter',
      bovenlicht: true,
      bovenlichtHeightCm: 20,
      bovenlichtGapCm: 0,
    })
    const elev = projectFacadeElevation(rear.plan, group.id, () => ({
      doorDefault: false,
      windowDefault: false,
      heightCm: 20,
      gapCm: 0,
    }))
    expect(elev).not.toBeNull()
    const achter = elev!.walls.find((item) => item.wallId === 'achter')!
    const serre = elev!.walls.find((item) => item.wallId === 'serre')!
    expect(serre.depthCm).toBeGreaterThan(achter.depthCm + 8)
    expect(elev!.walls.indexOf(achter)).toBeLessThan(elev!.walls.indexOf(serre))

    const rearDoor = elev!.openings.find((item) => item.openingGuid === 'door-achter')!
    const rearTransom = elev!.transoms.find((item) => item.openingId === rearDoor.openingId)!
    const transomMid = {
      x: (rearTransom.x0 + rearTransom.x1) / 2,
      y: (rearTransom.y0 + rearTransom.y1) / 2,
    }
    expect(hitElevationOpening(elev!, transomMid)).toBeNull()
    expect(hitElevationWall(elev!, transomMid)?.wallId).toBe('serre')

    const rings = elevationWallFillRings(achter, [rearDoor, rearTransom])
    expect(rings.length).toBeGreaterThan(1)
    const hole = rings[1]
    const holeXs = hole.map((point) => point.x)
    expect(Math.min(...holeXs)).toBeGreaterThanOrEqual(Math.min(achter.aTop.x, achter.bTop.x) - 0.1)
    expect(Math.max(...holeXs)).toBeLessThanOrEqual(Math.max(achter.aTop.x, achter.bTop.x) + 0.1)

    const planes = groupElevationPaintPlanes(elev!)
    expect(planes.length).toBeGreaterThanOrEqual(2)
    const rearPlane = planes.find((plane) => plane.walls.some((item) => item.wallId === 'achter'))
    const frontPlane = planes.find((plane) => plane.walls.some((item) => item.wallId === 'serre'))
    expect(rearPlane).not.toBe(frontPlane)
    expect(frontPlane!.openings.some((item) => item.openingGuid === 'door-achter')).toBe(false)
  })

  it('gesplitste muur op dezelfde diepte: raam over de naad blijft zichtbaar', () => {
    const plan = createEmptyFloorPlan({ name: 'Split', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('gevel-l', { x: 0, y: 0 }, { x: 200, y: 0 }),
      wall('gevel-r', { x: 200, y: 0 }, { x: 400, y: 0 }),
    ]
    const group = createFacadeGroup(plan, { name: 'Voorgevel', code: 'VG' })
    assignWallsToGroup(plan, group.id, ['gevel-l', 'gevel-r'])
    const added = addPlanOpening(plan, 'gevel-l', {
      type: 'window',
      refid: CONCEPT_WINDOW_REFID,
      t: 0.95,
      width: 80,
      z: 40,
      z_height: 180,
      guid: 'win-naad',
    })
    const elev = projectFacadeElevation(added.plan, group.id)!
    const left = elev.walls.find((item) => item.wallId === 'gevel-l')!
    const right = elev.walls.find((item) => item.wallId === 'gevel-r')!
    expect(Math.abs(left.depthCm - right.depthCm)).toBeLessThan(1)

    const planes = groupElevationPaintPlanes(elev)
    expect(planes).toHaveLength(1)
    expect(planes[0].walls).toHaveLength(2)
    const win = planes[0].openings.find((item) => item.openingGuid === 'win-naad')!
    expect(win.x0).toBeLessThan(Math.max(left.xa, left.xb))
    expect(win.x1).toBeGreaterThan(Math.min(right.xa, right.xb))

    const rightRings = elevationWallFillRings(right, [...planes[0].openings, ...planes[0].transoms])
    expect(rightRings.length).toBeGreaterThan(1)
    const overlapX =
      (Math.max(win.x0, Math.min(right.aTop.x, right.bTop.x)) +
        Math.min(win.x1, Math.max(right.aTop.x, right.bTop.x))) /
      2
    const overlapY = (win.y0 + win.y1) / 2
    expect(hitElevationOpening(elev, { x: overlapX, y: overlapY })?.openingGuid).toBe('win-naad')
  })

  it('bovenlicht krijgt een eigen gat, los van de deur', () => {
    const plan = twoFloorPlan()
    const added = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-holes',
      bovenlicht: true,
      bovenlichtHeightCm: 20,
      bovenlichtGapCm: 0,
    })
    const elev = projectFacadeElevation(added.plan, 'G1')!
    const wall = elev.walls.find((item) => item.wallId === 'front-bg')!
    const door = elev.openings[0]
    const transom = elev.transoms[0]
    const onlyDoor = elevationWallFillRings(wall, [door])
    const withTransom = elevationWallFillRings(wall, [door, transom])
    expect(onlyDoor).toHaveLength(2)
    expect(withTransom).toHaveLength(3)
    const transomHole = withTransom[2]
    const transomY = transomHole.map((point) => point.y)
    expect(Math.min(...transomY)).toBeCloseTo(transom.y0, 5)
    expect(Math.max(...transomY)).toBeCloseTo(transom.y1, 5)
  })

  it('muur-vulling zonder overlappinge opening blijft één ring', () => {
    const plan = twoFloorPlan()
    const elev = projectFacadeElevation(plan, 'G1')!
    const bg = elev.walls.find((item) => item.wallId === 'front-bg')!
    expect(elevationWallFillRings(bg, []).length).toBe(1)
    expect(elevationWallFillRings(bg, [{ x0: 5000, y0: -100, x1: 5100, y1: 0 }]).length).toBe(1)
  })

  it('unpacked: los raam in openings, geen synthetische transom', () => {
    const plan = twoFloorPlan()
    plan.source = {
      ...plan.source,
      settings: { ...(plan.source?.settings ?? {}), bovenlichtPacked: false },
    }
    const withDoor = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-loose',
      bovenlicht: true,
    })
    const withTransom = addPlanOpening(withDoor.plan, 'front-bg', {
      type: 'window',
      refid: CONCEPT_WINDOW_REFID,
      t: 0.5,
      width: 90,
      z: 230,
      z_height: 40,
      guid: 'door-loose-bovenlicht',
    })
    const elev = projectFacadeElevation(withTransom.plan, 'G1', () => ({
      doorDefault: true,
      windowDefault: false,
      heightCm: 40,
      gapCm: 10,
    }))
    expect(elev).not.toBeNull()
    expect(elev!.transoms).toHaveLength(0)
    expect(elev!.openings.some((o) => o.openingGuid === 'door-loose-bovenlicht')).toBe(true)
  })

  it('startOnLeft volgt muur a→b in het aanzicht', () => {
    const plan = twoFloorPlan()
    const forward = addPlanOpening(plan, 'front-bg', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-fwd',
      mirrored: [0, 0],
    })
    const elevFwd = projectFacadeElevation(forward.plan, 'G1')
    expect(elevFwd!.openings[0]?.startOnLeft).toBe(true)

    const reversed = createEmptyFloorPlan({ name: 'Rev', wallHeightCm: 280 })
    reversed.floors[0].walls = [wall('front-rev', { x: 400, y: 0 }, { x: 0, y: 0 })]
    const group = createFacadeGroup(reversed, { name: 'Voorgevel', code: 'VG' })
    assignWallsToGroup(reversed, group.id, ['front-rev'])
    const added = addPlanOpening(reversed, 'front-rev', {
      type: 'door',
      refid: CONCEPT_DOOR_REFID,
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      guid: 'door-rev',
      mirrored: [0, 0],
    })
    const elevRev = projectFacadeElevation(added.plan, group.id)
    expect(elevRev!.openings[0]?.startOnLeft).toBe(false)
    const glyph = glyphFromElevationRect(elevRev!.openings[0])
    const handle = glyph.circles.find((circle) => circle.role === 'handle')
    const mid = (elevRev!.openings[0].x0 + elevRev!.openings[0].x1) / 2
    expect(handle).toBeTruthy()
    expect(handle!.cx).toBeLessThan(mid)
  })
})
