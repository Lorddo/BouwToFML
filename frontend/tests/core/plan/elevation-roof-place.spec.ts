import { describe, expect, it } from 'vitest'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import { assignWallsToGroup, createFacadeGroup } from '@/core/plan/facade-groups'
import { projectFacadeElevation } from '@/core/plan/facade-elevation'
import { collectElevationSegmentSnapYs } from '@/core/plan/elevation-hit'
import { floorSlabWorldRange, floorWallBaseWorldZ } from '@/core/plan/floor-stack'
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
    expect(preview!.ridgeWallId).toBe('r1')
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

  it('korte nok → toch volle diepte (nok alleen Z, niet de span)', () => {
    const { plan, groupId, ridgeZCm } = gableWithRidge(280, 350)
    const short = markWallAsRidge(
      wall('r-short', { x: 80, y: 400 }, { x: 180, y: 400 }),
      ridgeEndpointExtras(280, 30, ridgeZCm),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [short])
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable')!
    const xLo = Math.min(gable.xa, gable.xb) + 20
    const ridgeElev = elev.walls.find((item) => item.wallId === 'r-short')!
    const xRidge = (ridgeElev.x0 + ridgeElev.x1) / 2
    const base = floorWallBaseWorldZ(plan, 0)
    const draft = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: -(base + 280) })!
    const preview = previewRoofFromElevation(plan, elev, draft, {
      x: xRidge,
      y: -(base + ridgeZCm),
    })
    expect(preview).not.toBeNull()
    expect(preview!.ridgeWallId).toBe('r-short')
    const [, nearPeak, farPeak] = preview!.poly
    expect(Math.abs(nearPeak.x - farPeak.x)).toBeGreaterThan(390)
    expect(nearPeak.z).toBe(ridgeZCm + 30)
    expect(farPeak.z).toBe(ridgeZCm + 30)
  })

  it('zonder nok → quad tot andere gevel, piek-Z uit klik', () => {
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
    const xPeak = (gable.xa + gable.xb) / 2
    const base = floorWallBaseWorldZ(plan, 0)
    const draft = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: -(base + 280) })
    expect(draft).not.toBeNull()

    const preview = previewRoofFromElevation(plan, elev, draft!, {
      x: xPeak,
      y: -(base + 350),
    })
    expect(preview).not.toBeNull()
    expect(preview!.ridgeWallId).toBeNull()
    expect(preview!.poly).toHaveLength(4)
    const [nearEave, nearPeak, farPeak, farEave] = preview!.poly
    expect(Math.abs(nearPeak.x - farPeak.x)).toBeGreaterThan(390)
    expect(Math.hypot(farEave.x - nearEave.x, farEave.y - nearEave.y)).toBeGreaterThan(390)
    expect(nearPeak.z).toBe(350)
    expect(farPeak.z).toBe(350)
    expect(farEave.z).toBe(nearEave.z)

    const result = placeRoofFromElevation(plan, elev, draft!, {
      x: xPeak,
      y: -(base + 350),
    })
    expect(result).not.toBeNull()
    expect(listRidgeSurfacesOnFloor(result!.plan.floors[0])).toHaveLength(1)
  })

  it('2e klik op dezelfde X als de goot → geen vlak (ontaard)', () => {
    const plan = createEmptyFloorPlan({ name: 'ZelfdeX', wallHeightCm: 280 })
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
    const draft = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: -(base + 280) })!
    expect(
      previewRoofFromElevation(plan, elev, draft, {
        x: xLo,
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

  it('goot-klik snapt X naar een bestaand dakvlak-punt op dezelfde floor', () => {
    const { plan, groupId } = gableWithRidge(280, 350)
    const existing = markRoofSurfaceManual(
      makeRoofSurface({
        id: 'roof-keep',
        poly: [
          { x: 0, y: 0, z: 280 },
          { x: 0, y: 400, z: 380 },
          { x: 400, y: 400, z: 380 },
          { x: 400, y: 0, z: 280 },
        ],
        origin: 'manual',
      }),
    )
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [existing])
    const elev = projectFacadeElevation(plan, groupId)!
    expect(elev.roofPlanes.length).toBeGreaterThan(0)
    const targetX = elev.roofPlanes[0]!.points[1]!.x
    const base = floorWallBaseWorldZ(plan, 0)
    const draft = beginRoofPlaceFromElevation(plan, elev, {
      x: targetX + 6,
      y: -(base + 280),
    })
    expect(draft).not.toBeNull()
    expect(draft!.eaveElev.x).toBeCloseTo(targetX, 0)
    expect(draft!.floorIndex).toBe(0)
  })

  it('klik op de 1e-vloerplaat start een 1e-dakvlak, ook als de 1e al een dak heeft', () => {
    const { plan, groupId } = gableWithRidge(280, 350)
    const upper = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 280 })
    upper.walls = plan.floors[0].walls
      .filter((item) => item.id !== 'r1')
      .map((item) => ({ ...item, id: `u-${item.id}` }))
    plan.floors.push(upper)
    assignWallsToGroup(plan, groupId, ['gable', 'u-gable'])
    plan.floors[1] = setRidgeSurfacesOnFloor(plan.floors[1], [
      markRoofSurfaceManual(
        makeRoofSurface({
          id: 'roof-1e',
          origin: 'manual',
          poly: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 400, z: 120 },
            { x: 400, y: 400, z: 120 },
            { x: 400, y: 0, z: 0 },
          ],
        }),
      ),
    ])
    const elev = projectFacadeElevation(plan, groupId)!
    const gable = elev.walls.find((item) => item.wallId === 'gable' && item.floorIndex === 0)!
    const xMid = (gable.xa + gable.xb) / 2
    const base1 = floorWallBaseWorldZ(plan, 1)
    const draft = beginRoofPlaceFromElevation(plan, elev, {
      x: xMid,
      y: -base1,
    })
    expect(draft).not.toBeNull()
    expect(draft!.floorIndex).toBe(1)
  })

  it('1e-dakvlak vanaf de vloerplaat zonder nok', () => {
    const plan = createEmptyFloorPlan({ name: 'Twee', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('gable', { x: 0, y: 0 }, { x: 0, y: 800 }),
      wall('back', { x: 400, y: 0 }, { x: 400, y: 800 }),
      wall('s0', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s1', { x: 0, y: 800 }, { x: 400, y: 800 }),
    ]
    const upper = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 280 })
    upper.walls = plan.floors[0].walls.map((item) => ({ ...item, id: `u-${item.id}` }))
    plan.floors.push(upper)
    const group = createFacadeGroup(plan, { name: 'Kop' })
    assignWallsToGroup(plan, group.id, ['gable', 'u-gable'])
    const elev = projectFacadeElevation(plan, group.id)!
    const gable = elev.walls.find((item) => item.wallId === 'u-gable')!
    const xLo = Math.min(gable.xa, gable.xb) + 20
    const xPeak = (gable.xa + gable.xb) / 2
    const base1 = floorWallBaseWorldZ(plan, 1)
    const draft = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: -base1 })
    expect(draft).not.toBeNull()
    expect(draft!.floorIndex).toBe(1)
    const preview = previewRoofFromElevation(plan, elev, draft!, {
      x: xPeak,
      y: -(base1 + 200),
    })
    expect(preview).not.toBeNull()
    expect(preview!.floorIndex).toBe(1)
    expect(preview!.ridgeWallId).toBeNull()
    const result = placeRoofFromElevation(plan, elev, draft!, {
      x: xPeak,
      y: -(base1 + 200),
    })
    expect(result?.floorIndex).toBe(1)
    expect(listRidgeSurfacesOnFloor(result!.plan.floors[1])).toHaveLength(1)
    expect(listRidgeSurfacesOnFloor(result!.plan.floors[0])).toHaveLength(0)
  })

  it('onderkant 1e-plaat + lichte snap blijft een 1e-dakvlak', () => {
    const plan = createEmptyFloorPlan({ name: 'Soffit', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('gable', { x: 0, y: 0 }, { x: 0, y: 800 }),
      wall('back', { x: 400, y: 0 }, { x: 400, y: 800 }),
      wall('s0', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s1', { x: 0, y: 800 }, { x: 400, y: 800 }),
    ]
    const upper = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 280 })
    upper.walls = plan.floors[0].walls.map((item) => ({ ...item, id: `u-${item.id}` }))
    plan.floors.push(upper)
    const group = createFacadeGroup(plan, { name: 'Kop' })
    assignWallsToGroup(plan, group.id, ['gable', 'u-gable'])
    const elev = projectFacadeElevation(plan, group.id)!
    const gable = elev.walls.find((item) => item.wallId === 'u-gable')!
    const xLo = Math.min(gable.xa, gable.xb) + 20
    const slab1 = floorSlabWorldRange(plan, 1)!
    const onSoffit = beginRoofPlaceFromElevation(plan, elev, { x: xLo, y: -slab1.z0 })
    expect(onSoffit?.floorIndex).toBe(1)
    expect(onSoffit!.eave.z).toBeLessThanOrEqual(0)
    const nearSoffit = beginRoofPlaceFromElevation(plan, elev, {
      x: xLo,
      y: -(slab1.z0 - 6),
    })
    expect(nearSoffit?.floorIndex).toBe(1)
  })

  it('geen dakvlak op de BG waar de 1e-plaat boven zit', () => {
    const plan = createEmptyFloorPlan({ name: 'GeenBgDak', wallHeightCm: 280 })
    plan.floors[0].walls = [
      wall('gable', { x: 0, y: 0 }, { x: 0, y: 800 }),
      wall('back', { x: 400, y: 0 }, { x: 400, y: 800 }),
      wall('s0', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s1', { x: 0, y: 800 }, { x: 400, y: 800 }),
    ]
    const upper = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 280 })
    upper.walls = plan.floors[0].walls.map((item) => ({ ...item, id: `u-${item.id}` }))
    plan.floors.push(upper)
    const group = createFacadeGroup(plan, { name: 'Kop' })
    assignWallsToGroup(plan, group.id, ['gable', 'u-gable'])
    const elev = projectFacadeElevation(plan, group.id)!
    const gable = elev.walls.find((item) => item.wallId === 'gable' && item.floorIndex === 0)!
    const xMid = (gable.xa + gable.xb) / 2
    const base0 = floorWallBaseWorldZ(plan, 0)
    expect(beginRoofPlaceFromElevation(plan, elev, { x: xMid, y: -(base0 + 140) })).toBeNull()
  })

  it('muur-hoogte-snap op BG pakt geen 1e-dak', () => {
    const { plan, groupId } = gableWithRidge(280, 350)
    const upper = createBlankFloor({ name: '1e', level: 1, wallHeightCm: 280 })
    upper.walls = plan.floors[0].walls
      .filter((item) => item.id !== 'r1')
      .map((item) => ({ ...item, id: `u-${item.id}` }))
    plan.floors.push(upper)
    assignWallsToGroup(plan, groupId, ['gable', 'u-gable'])
    const elev = projectFacadeElevation(plan, groupId)!
    const up = elev.walls.find((item) => item.wallId === 'u-gable')!
    const ys = collectElevationSegmentSnapYs(elev, { floorIndex: 0 })
    expect(ys).not.toContain(up.aTop.y)
    expect(ys).not.toContain(up.bTop.y)
  })
})
