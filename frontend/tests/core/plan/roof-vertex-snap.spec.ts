import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import { assignWallsToGroup, createFacadeGroup } from '@/core/plan/facade-groups'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  dropEmptyRidgeDesign,
  ensureRidgeDesign,
  isRidgeDesign,
  markWallAsRidge,
  ridgeEndpointExtras,
  setRidgeWallsOnFloor,
} from '@/core/plan/ridge-walls'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  ROOF_SURFACE_COLOR,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
} from '@/core/plan/roof-planes'
import { snapRoofVertexToWallFace } from '@/core/plan/roof-vertex-snap'
import type { FloorPlan, Wall } from '@/core/plan/types'
import { makeEndpoint3D } from '@/core/plan/wall-endpoint-height'

const H = 260

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  heightCm = H,
): Wall {
  const end = makeEndpoint3D(0, heightCm)
  return { id, a, b, thickness: 20, openings: [], extras: { az: end, bz: { ...end } } }
}

function rectWalls(prefix: string, x0: number, y0: number, x1: number, y1: number): Wall[] {
  return [
    wall(`${prefix}s`, { x: x0, y: y0 }, { x: x1, y: y0 }),
    wall(`${prefix}e`, { x: x1, y: y0 }, { x: x1, y: y1 }),
    wall(`${prefix}n`, { x: x1, y: y1 }, { x: x0, y: y1 }),
    wall(`${prefix}w`, { x: x0, y: y1 }, { x: x0, y: y0 }),
  ]
}

function housePlan(): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Daktest', wallHeightCm: H })
  plan.floors[0].walls = rectWalls('g', 0, 0, 800, 800)
  const group = createFacadeGroup(plan, { name: 'Gevels' })
  assignWallsToGroup(
    plan,
    group.id,
    plan.floors[0].walls.map((item) => item.id),
  )
  const extras = ridgeEndpointExtras(H, 20, 450)
  const ridge = markWallAsRidge(wall('r1', { x: 0, y: 400 }, { x: 800, y: 400 }), extras)
  plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
  return plan
}

describe('roof-vertex-snap', () => {
  it('dakvlak-punt bij hoek snapt naar twee buitenfaces, niet face+hartlijn', () => {
    const plan = housePlan()
    const hit = snapRoofVertexToWallFace({ plan, point: { x: 2, y: -3 } })
    expect(hit?.x).toBeCloseTo(-10)
    expect(hit?.y).toBeCloseTo(-10)
    expect(hit?.z).toBe(H)
    expect(hit).not.toEqual({ x: 0, y: 0, z: H })
    expect(hit).not.toEqual({ x: 2, y: -10, z: H })
  })

  it('dakvlak-punt midden op goot blijft op die buitenface', () => {
    const plan = housePlan()
    const hit = snapRoofVertexToWallFace({ plan, point: { x: 400, y: -3 } })
    expect(hit?.x).toBeCloseTo(400)
    expect(hit?.y).toBeCloseTo(-10)
    expect(hit?.z).toBe(H)
  })

  it('roundtrip: isRoof + z overleven; Dak met alleen surfaces blijft', () => {
    const plan = housePlan()
    const surface = makeRoofSurface({
      id: 'roof-keep',
      poly: [
        { x: 0, y: 0, z: 260 },
        { x: 800, y: 0, z: 260 },
        { x: 800, y: 400, z: 450 },
        { x: 0, y: 400, z: 450 },
      ],
      origin: 'manual',
    })
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [surface])
    const json = JSON.parse(buildFmlV3(plan)) as {
      floors: Array<{
        designs?: Array<{
          name?: string
          surfaces?: Array<{ isRoof?: boolean; poly?: Array<{ z?: number }> }>
        }>
      }>
    }
    const dak = json.floors[0].designs?.find((design) => design.name === 'Dak')
    expect(dak?.surfaces?.[0]?.isRoof).toBe(true)
    expect(dak?.surfaces?.[0]?.poly?.[2]?.z).toBe(450)

    const imported = importFmlV3(json).plan
    const roofs = listRidgeSurfacesOnFloor(imported.floors[0])
    expect(roofs).toHaveLength(1)
    expect(roofs[0].isRoof).toBe(true)
    expect(roofs[0].poly[2]?.z).toBe(450)

    const { floor } = ensureRidgeDesign(createEmptyFloorPlan().floors[0])
    const withSurf = setRidgeSurfacesOnFloor(floor, [surface])
    expect(dropEmptyRidgeDesign(withSurf).designs?.some(isRidgeDesign)).toBe(true)
  })

  it('dakvlak zonder kleur of wit krijgt de dakkleur', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]
    expect(makeRoofSurface({ id: 'a', poly, origin: 'manual' }).color).toBe(ROOF_SURFACE_COLOR)
    expect(makeRoofSurface({ id: 'b', poly, origin: 'manual', color: '#ffffff' }).color).toBe(
      ROOF_SURFACE_COLOR,
    )
    expect(makeRoofSurface({ id: 'c', poly, origin: 'manual', color: '#88AACC' }).color).toBe(
      '#88AACC',
    )
  })

  it('.plg-roundtrip: dakvlak origin + roofPlanes GUID-lijst', () => {
    const plan = createEmptyFloorPlan({ name: 'DakvlakPlg' })
    const surface = makeRoofSurface({
      id: 'roof-1',
      origin: 'manual',
      poly: [
        { x: 0, y: 0, z: 280 },
        { x: 100, y: 0, z: 280 },
        { x: 100, y: 100, z: 400 },
        { x: 0, y: 100, z: 400 },
      ],
    })
    expect(surface.origin).toBe('manual')
    expect(surface.extras?.btfOrigin).toBeUndefined()
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [surface])
    syncRoofPlaneGuidsFromDesigns(plan)
    expect(plan.roof?.planes.surfaceIds).toEqual(['roof-1'])

    const raw = JSON.parse(buildFmlV3(plan)) as {
      settings: { roofPlanes?: { surfaceGuids: string[] } }
      floors: Array<{
        designs?: Array<{ surfaces?: Array<{ guid: string; btfOrigin?: string }> }>
      }>
    }
    expect(raw.settings.roofPlanes?.surfaceGuids).toEqual(['roof-1'])
    const dakSurf = raw.floors[0].designs
      ?.flatMap((d) => d.surfaces ?? [])
      .find((s) => s.guid === 'roof-1')
    expect(dakSurf?.btfOrigin).toBe('manual')

    const imported = importFmlV3(raw).plan
    expect(imported.roof?.planes.surfaceIds).toEqual(['roof-1'])
    expect(imported.source?.settings?.roofPlanes).toBeUndefined()
    const again = listRidgeSurfacesOnFloor(imported.floors[0])[0]
    expect(again?.origin).toBe('manual')
    expect(again?.extras?.btfOrigin).toBeUndefined()
  })
})
