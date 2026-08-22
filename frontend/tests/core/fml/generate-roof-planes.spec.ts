import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { createBlankFloor, createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { projectFacadeElevation } from '@/core/fml/facade-elevation'
import {
  assignWallsToGroup,
  createFacadeGroup,
  listElevationFacadeGroups,
} from '@/core/fml/facade-groups'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import {
  applyGeneratedRoofPlanes,
  applyGeneratedRoofPlanesForPlan,
  generateRoofPlanesForFloor,
  snapRoofVertexToWallFace,
} from '@/core/fml/generate-roof-planes'
import {
  dropEmptyRidgeDesign,
  ensureRidgeDesign,
  isRidgeDesign,
  markWallAsRidge,
  ridgeEndpointExtras,
  setRidgeWallsOnFloor,
} from '@/core/fml/ridge-walls'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  markRoofSurfaceManual,
  ROOF_SURFACE_COLOR,
  setRidgeSurfacesOnFloor,
} from '@/core/fml/roof-planes'
import type { FloorPlan, Wall } from '@/core/fml/types'
import { makeEndpoint3D } from '@/core/fml/wall-endpoint-height'

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

function housePlan(opts?: { ridge?: { x0: number; x1: number; y: number; z: number } }): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Daktest', wallHeightCm: H })
  plan.floors[0].walls = rectWalls('g', 0, 0, 800, 800)
  const group = createFacadeGroup(plan, { name: 'Gevels' })
  assignWallsToGroup(
    plan,
    group.id,
    plan.floors[0].walls.map((item) => item.id),
  )
  if (opts?.ridge) {
    const extras = ridgeEndpointExtras(H, 20, opts.ridge.z)
    const ridge = markWallAsRidge(
      wall('r1', { x: opts.ridge.x0, y: opts.ridge.y }, { x: opts.ridge.x1, y: opts.ridge.y }),
      extras,
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
  }
  return plan
}

function vertexCount(surfaces: { poly: unknown[] }[]): number[] {
  return surfaces.map((surface) => surface.poly.length).sort((a, b) => a - b)
}

describe('generate-roof-planes', () => {
  it('collineaire gevelstukken → één vlak, geen splinters', () => {
    const plan = housePlan({ ridge: { x0: 0, x1: 800, y: 400, z: 450 } })
    const keep = plan.floors[0].walls.filter((item) => item.id !== 'gs')
    const pieces = [
      wall('gs1', { x: 0, y: 0 }, { x: 250, y: 0 }),
      wall('gs2', { x: 250, y: 0 }, { x: 520, y: 0 }),
      wall('gs3', { x: 520, y: 0 }, { x: 800, y: 0 }),
      wall('stub', { x: 800, y: 8 }, { x: 800, y: 22 }),
    ]
    plan.floors[0].walls = [...keep, ...pieces]
    const group = listElevationFacadeGroups(plan)[0]
    if (group) {
      assignWallsToGroup(
        plan,
        group.id,
        plan.floors[0].walls.map((item) => item.id),
      )
    }
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    expect(surfaces).toHaveLength(2)
    expect(vertexCount(surfaces)).toEqual([4, 4])
  })

  it('nok tot beide koppen → 2 vlakken, geen heup', () => {
    const plan = housePlan({ ridge: { x0: 0, x1: 800, y: 400, z: 450 } })
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    expect(surfaces).toHaveLength(2)
    expect(vertexCount(surfaces)).toEqual([4, 4])
    expect(surfaces.every((surface) => surface.isRoof)).toBe(true)
  })

  it('nok korter → 2 vlakken + 2 heupdriehoeken', () => {
    const plan = housePlan({ ridge: { x0: 200, x1: 600, y: 400, z: 450 } })
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    expect(surfaces).toHaveLength(4)
    expect(vertexCount(surfaces)).toEqual([3, 3, 4, 4])
  })

  it('twee hoogtes (knik) → twee banden', () => {
    const plan = housePlan()
    const lowS = markWallAsRidge(
      wall('rl', { x: 0, y: 200 }, { x: 800, y: 200 }),
      ridgeEndpointExtras(H, 20, 350),
    )
    const lowN = markWallAsRidge(
      wall('rn', { x: 0, y: 600 }, { x: 800, y: 600 }),
      ridgeEndpointExtras(H, 20, 350),
    )
    const high = markWallAsRidge(
      wall('rh', { x: 0, y: 400 }, { x: 800, y: 400 }),
      ridgeEndpointExtras(H, 20, 450),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [lowS, lowN, high])
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    expect(surfaces.length).toBeGreaterThanOrEqual(4)
  })

  it('zelfde omtrek erboven → geen dak op de lagere floor', () => {
    const plan = housePlan({ ridge: { x0: 0, x1: 800, y: 400, z: 450 } })
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: H })
    upper.walls = rectWalls('u', 0, 0, 800, 800)
    plan.floors.push(upper)
    expect(generateRoofPlanesForFloor(plan, 0)).toEqual([])
    const applied = applyGeneratedRoofPlanesForPlan(plan)
    expect(listRidgeSurfacesOnFloor(applied.floors[0])).toHaveLength(0)
  })

  it('nok alleen op bovenverdieping → geen vlakken op lagere floors', () => {
    const plan = housePlan()
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: H })
    upper.walls = rectWalls('u', 0, 0, 800, 800)
    const extras = ridgeEndpointExtras(H, 20, 450)
    const ridge = markWallAsRidge(wall('r-up', { x: 0, y: 400 }, { x: 800, y: 400 }), extras)
    plan.floors.push(upper)
    plan.floors[1] = setRidgeWallsOnFloor(plan.floors[1], [ridge])
    const group = listElevationFacadeGroups(plan)[0]
    if (group)
      assignWallsToGroup(
        plan,
        group.id,
        plan.floors[1].walls.map((item) => item.id),
      )
    expect(generateRoofPlanesForFloor(plan, 0)).toEqual([])
    expect(generateRoofPlanesForFloor(plan, 1).length).toBeGreaterThan(0)
    const applied = applyGeneratedRoofPlanesForPlan(plan)
    expect(listRidgeSurfacesOnFloor(applied.floors[0])).toHaveLength(0)
    expect(listRidgeSurfacesOnFloor(applied.floors[1]).length).toBeGreaterThan(0)
  })

  it('aanbouw-nok: alleen uitslag buiten de bovenste floor', () => {
    const plan = housePlan({ ridge: { x0: 0, x1: 800, y: 900, z: 400 } })
    plan.floors[0].walls = rectWalls('g', 0, 0, 800, 1000)
    const group = listElevationFacadeGroups(plan)[0]
    if (group) {
      assignWallsToGroup(
        plan,
        group.id,
        plan.floors[0].walls.map((item) => item.id),
      )
    }
    const upper = createBlankFloor({ name: '2e', level: 1, wallHeightCm: H })
    upper.walls = rectWalls('u', 0, 0, 800, 700)
    plan.floors.push(upper)
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    expect(surfaces.length).toBeGreaterThan(0)
    expect(surfaces.every((surface) => surface.poly.every((point) => (point.y ?? 0) >= 690))).toBe(
      true,
    )
  })

  it('kleinere floor erboven → lean-to tot die omtrek', () => {
    const plan = housePlan()
    const upper = createBlankFloor({ name: 'Verdieping 1', level: 1, wallHeightCm: H })
    upper.walls = rectWalls('u', 200, 200, 600, 600)
    plan.floors.push(upper)
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    expect(surfaces.length).toBeGreaterThanOrEqual(4)
    expect(
      generateRoofPlanesForFloor(plan, 0).every((s) => s.poly.some((p) => (p.z ?? 0) > H)),
    ).toBe(true)
  })

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

  it('goot ligt op de buitenkant, niet op de hartlijn', () => {
    const plan = housePlan({ ridge: { x0: 0, x1: 800, y: 400, z: 450 } })
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    const ys = surfaces.flatMap((surface) => surface.poly.map((p) => p.y))
    expect(ys.some((y) => y <= -9)).toBe(true)
  })

  it('geen doel → 0 surfaces', () => {
    const plan = housePlan()
    expect(generateRoofPlanesForFloor(plan, 0)).toEqual([])
  })

  it('nok raakt gevel → geen vlak op die rand', () => {
    const plan = housePlan({ ridge: { x0: 0, x1: 800, y: 400, z: 450 } })
    const surfaces = generateRoofPlanesForFloor(plan, 0)
    const xs = surfaces.flatMap((surface) => surface.poly.map((p) => p.x))
    const hasFullEastQuad = surfaces.some(
      (surface) => surface.poly.length === 4 && surface.poly.every((p) => Math.abs(p.x - 800) < 1),
    )
    expect(hasFullEastQuad).toBe(false)
    expect(xs.some((x) => x === 0 || x === 800)).toBe(true)
  })

  it('regen houdt manual, vervangt generated', () => {
    const plan = housePlan({ ridge: { x0: 0, x1: 800, y: 400, z: 450 } })
    const first = applyGeneratedRoofPlanes(plan, 0)
    const generatedIds = listRidgeSurfacesOnFloor(first.floors[0]).map((s) => s.id)
    expect(generatedIds.length).toBe(2)
    const manual = markRoofSurfaceManual(
      makeRoofSurface({
        id: 'manual-1',
        poly: [
          { x: 10, y: 10, z: 260 },
          { x: 40, y: 10, z: 260 },
          { x: 40, y: 40, z: 300 },
        ],
        origin: 'manual',
      }),
    )
    first.floors[0] = setRidgeSurfacesOnFloor(first.floors[0], [
      ...listRidgeSurfacesOnFloor(first.floors[0]),
      manual,
    ])
    const second = applyGeneratedRoofPlanes(first, 0)
    const ids = listRidgeSurfacesOnFloor(second.floors[0]).map((s) => s.id)
    expect(ids).toContain('manual-1')
    expect(ids.filter((id) => generatedIds.includes(id))).toEqual([])
    expect(ids.length).toBe(3)
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
      origin: 'generated',
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

  it('aanzicht toont alleen het dakvlak dat die gevel raakt', () => {
    const plan = applyGeneratedRoofPlanes(
      housePlan({ ridge: { x0: 0, x1: 800, y: 400, z: 450 } }),
      0,
    )
    const groups = listElevationFacadeGroups(plan)
    const elevation = projectFacadeElevation(plan, groups[0].id)
    expect(elevation?.roofPlanes.length).toBeGreaterThan(0)
    expect(elevation?.roofPlanes.every((plane) => plane.points.length >= 3)).toBe(true)
  })
})
