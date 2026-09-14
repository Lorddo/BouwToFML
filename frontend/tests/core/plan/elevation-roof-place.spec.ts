import { describe, expect, it } from 'vitest'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import { assignWallsToGroup, createFacadeGroup } from '@/core/plan/facade-groups'
import { projectFacadeElevation } from '@/core/plan/facade-elevation'
import { floorWallBaseWorldZ } from '@/core/plan/floor-stack'
import {
  beginRoofPlaceFromElevation,
  placeRoofFromElevation,
  previewRoofFromElevation,
} from '@/core/plan/elevation-roof-place'
import {
  listRidgeSurfacesOnFloor,
  markRoofSurfaceManual,
  makeRoofSurface,
  setRidgeSurfacesOnFloor,
} from '@/core/plan/roof-planes'
import { markWallAsRidge, ridgeEndpointExtras, setRidgeWallsOnFloor } from '@/core/plan/ridge-walls'
import type { Wall } from '@/core/plan/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

/** Diepte 400 (X) × breedte 800 (Y); kopse gevel op x=0; nok y=400. */
function gableWithRidge(wallHeightCm = 280, ridgeZCm = 350) {
  const plan = createEmptyFloorPlan({ name: 'Dak', wallHeightCm })
  plan.floors[0].walls = [
    wall('gable', { x: 0, y: 0 }, { x: 0, y: 800 }),
    wall('back', { x: 400, y: 0 }, { x: 400, y: 800 }),
    wall('s0', { x: 0, y: 0 }, { x: 400, y: 0 }),
    wall('s1', { x: 0, y: 800 }, { x: 400, y: 800 }),
  ]
  const ridge = markWallAsRidge(
    wall('r1', { x: 0, y: 400 }, { x: 400, y: 400 }),
    ridgeEndpointExtras(wallHeightCm, 30, ridgeZCm),
  )
  plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
  const group = createFacadeGroup(plan, { name: 'Kopgevel' })
  assignWallsToGroup(plan, group.id, ['gable'])
  return { plan, groupId: group.id, ridgeZCm }
}

describe('elevation-roof-place', () => {
  it('goot+nok → quad langs nok (~400 cm diepte), floor 0', () => {
    const { plan, groupId, ridgeZCm } = gableWithRidge(280, 350)
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xLo = Math.min(gable.xa, gable.xb) + 20
    const ridgeElev = elev.walls.find((item) => item.wallId === 'r1')!
    const xRidge = (ridgeElev.x0 + ridgeElev.x1) / 2
    const base = floorWallBaseWorldZ(plan, 0)
    const eaveY = -(base + 280)
    const draft = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: eaveY })
    expect(draft).not.toBeNull()
    expect(draft!.floorIndex).toBe(0)

    const preview = previewRoofFromElevation(plan, elev, draft!, {
      x: xRidge,
      y: -(base + ridgeZCm),
    })
    expect(preview).not.toBeNull()
    expect(preview!.poly).toHaveLength(4)
    const [nearEave, nearRidge, farRidge, farEave] = preview!.poly
    expect(Math.abs(nearRidge.x - farRidge.x)).toBeGreaterThan(390)
    expect(Math.abs(nearRidge.y - farRidge.y)).toBeLessThan(1)
    expect(Math.hypot(farEave.x - nearEave.x, farEave.y - nearEave.y)).toBeGreaterThan(390)
    // Bovenkant nok = z + dakspan (30), niet onderkant.
    expect(nearRidge.z).toBe(ridgeZCm + 30)
    expect(farEave.z).toBe(nearEave.z)
    // Near op buitenface gevel (x < hartlijn 0), niet hartlijn.
    expect(nearRidge.x).toBeLessThan(-1)

    const result = placeRoofFromElevation(plan, elev, draft!, {
      x: xRidge,
      y: -(base + ridgeZCm),
    })
    expect(result).not.toBeNull()
    const surfaces = listRidgeSurfacesOnFloor(result!.plan.floors[0])
    expect(surfaces).toHaveLength(1)
    expect(surfaces[0].id).toBe(result!.surfaceId)
    expect(surfaces[0].poly).toHaveLength(4)
    expect(surfaces[0].isRoof).toBe(true)
  })

  it('Z goot uit klik-Y; nok-Z = bovenkant ridge', () => {
    const { plan, groupId, ridgeZCm } = gableWithRidge(280, 360)
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xLo = Math.min(gable.xa, gable.xb) + 30
    const ridgeElev = elev.walls.find((item) => item.wallId === 'r1')!
    const xRidge = (ridgeElev.x0 + ridgeElev.x1) / 2
    const base = floorWallBaseWorldZ(plan, 0)
    const eaveZ = 250
    const draft = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: -(base + eaveZ) })!
    expect(draft.eave.z).toBe(eaveZ)
    const preview = previewRoofFromElevation(plan, elev, draft, {
      x: xRidge,
      y: -(base + 999),
    })!
    expect(preview.poly[1].z).toBe(ridgeZCm + 30)
  })

  it('zonder nok → null', () => {
    const plan = createEmptyFloorPlan({ name: 'GeenNok', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('gable', { x: 0, y: 0 }, { x: 0, y: 800 }),
      wall('back', { x: 400, y: 0 }, { x: 400, y: 800 }),
      wall('s0', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s1', { x: 0, y: 800 }, { x: 400, y: 800 }),
    ]
    const group = createFacadeGroup(plan, { name: 'Kop' })
    assignWallsToGroup(plan, group.id, ['gable'])
    const elev = projectFacadeElevation(plan, group.id)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xLo = Math.min(gable.xa, gable.xb) + 20
    const base = floorWallBaseWorldZ(plan, 0)
    const draft = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: -(base + 280) })
    expect(draft).not.toBeNull()
    expect(
      previewRoofFromElevation(plan, elev, draft!, {
        x: (gable.xa + gable.xb) / 2,
        y: -(base + 350),
      }),
    ).toBeNull()
    expect(
      placeRoofFromElevation(plan, elev, draft!, {
        x: (gable.xa + gable.xb) / 2,
        y: -(base + 350),
      }),
    ).toBeNull()
  })

  it('tweede helling → tweede surface, geen overwrite', () => {
    const { plan, groupId, ridgeZCm } = gableWithRidge(280, 350)
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xLo = Math.min(gable.xa, gable.xb) + 20
    const xHi = Math.max(gable.xa, gable.xb) - 20
    const ridgeElev = elev.walls.find((item) => item.wallId === 'r1')!
    const xRidge = (ridgeElev.x0 + ridgeElev.x1) / 2
    const base = floorWallBaseWorldZ(plan, 0)
    const eaveY = -(base + 280)
    const ridgeClick = { x: xRidge, y: -(base + ridgeZCm) }

    const draft1 = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: eaveY })!
    const first = placeRoofFromElevation(plan, elev, draft1, ridgeClick)!
    expect(listRidgeSurfacesOnFloor(first.plan.floors[0])).toHaveLength(1)

    const elev2 = projectFacadeElevation(first.plan, groupId)!
    const draft2 = beginRoofPlaceFromElevation(first.plan, elev2, { x: xHi, y: eaveY })!
    const second = placeRoofFromElevation(first.plan, elev2, draft2, ridgeClick)!
    const surfaces = listRidgeSurfacesOnFloor(second.plan.floors[0])
    expect(surfaces).toHaveLength(2)
    expect(surfaces.map((s) => s.id).sort()).toEqual([first.surfaceId, second.surfaceId].sort())
  })

  it('bestaande manual surface blijft staan', () => {
    const { plan, groupId, ridgeZCm } = gableWithRidge(280, 350)
    const existing = markRoofSurfaceManual(
      makeRoofSurface({
        id: 'roof-keep',
        poly: [
          { x: 0, y: 0, z: 280 },
          { x: 0, y: 200, z: 350 },
          { x: 400, y: 200, z: 350 },
          { x: 400, y: 0, z: 280 },
        ],
        origin: 'manual',
      }),
    )
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [existing])
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xHi = Math.max(gable.xa, gable.xb) - 20
    const ridgeElev = elev.walls.find((item) => item.wallId === 'r1')!
    const base = floorWallBaseWorldZ(plan, 0)
    const draft = beginRoofPlaceFromElevation(plan, elev, {
      x: xHi,
      y: -(base + 280),
    })!
    const result = placeRoofFromElevation(plan, elev, draft, {
      x: (ridgeElev.x0 + ridgeElev.x1) / 2,
      y: -(base + ridgeZCm),
    })!
    const ids = listRidgeSurfacesOnFloor(result.plan.floors[0]).map((s) => s.id)
    expect(ids).toContain('roof-keep')
    expect(ids).toContain(result.surfaceId)
    expect(ids).toHaveLength(2)
  })
})
