import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  openingOverlapRatio,
  openingPatchFromElevationRect,
  projectFacadeElevation,
} from '@/core/fml/facade-elevation'
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
import { setElevationViewDrawing } from '@/core/fml/elevation-views'
import { addPlanOpening, updatePlanOpening } from '@/core/fml/elevation-openings'
import {
  CONCEPT_DOOR_REFID,
  CONCEPT_WINDOW_REFID,
  type FloorPlan,
  type Wall,
} from '@/core/fml/types'

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
  it('projecteert collineaire voorgevel op hartlijnlengte en laat return-wand vallen', () => {
    const plan = twoFloorPlan()
    const elev = projectFacadeElevation(plan, 'G1')
    expect(elev).not.toBeNull()
    const bg = elev!.walls.find((item) => item.wallId === 'front-bg')
    const ret = elev!.walls.find((item) => item.wallId === 'return-bg')
    expect(bg).toBeTruthy()
    expect(Math.abs(bg!.x1 - bg!.x0)).toBeCloseTo(400, 5)
    expect(ret).toBeUndefined()
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
})
