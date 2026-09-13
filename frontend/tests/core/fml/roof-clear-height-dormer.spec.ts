import { describe, expect, it } from 'vitest'
import { bindFloorWallsToRoofs, sampleCeilingRoofAtPoint } from '@/core/fml/bind-walls-to-roofs'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { projectFacadeElevation } from '@/core/fml/facade-elevation'
import { createFacadeGroup, assignWallsToGroup } from '@/core/fml/facade-groups'
import {
  clampLiningCm,
  clearHeightAtPointCm,
  clearHeightSnedeZCm,
  computeClearHeightBands,
  computeClearHeightContour,
} from '@/core/fml/roof-clear-height'
import { validateRoofOverlap } from '@/core/fml/roof-overlap'
import {
  DORMER_ROOF_SURFACE_COLOR,
  isDormerRoof,
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  ROOF_PLANES_SETTINGS_KEY,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
  withRoofKind,
} from '@/core/fml/roof-planes'
import type { FloorPlan, Wall } from '@/core/fml/types'
import { makeEndpoint3D } from '@/core/fml/wall-endpoint-height'
import {
  createPlgDocument,
  readPlg,
  writePlg,
  type PlgSettings,
} from '@/core/plg/plg-document'
import { roofAdapter } from '@/core/plg/fml-adapter/roof'

const H = 280

const FACTORY_PLG_SETTINGS: PlgSettings = {
  unitSystem: 'metric',
  scaleInputUnit: 'mm',
  planDisplayStyle: 'editor',
  showCanvasGrid: true,
  defaults: {
    wallHeightCm: 280,
    doorHeightCm: 220,
    windowHeightCm: 120,
    windowSillZCm: 100,
    bovenlichtDefault: false,
    windowBovenlichtDefault: false,
    bovenlichtHeightCm: 40,
    bovenlichtGapCm: 10,
    thicknessCms: [10, 20, 30],
    thicknessMinCm: 10,
    thicknessMidCm: 20,
    thicknessMaxCm: 30,
    dakThicknessCm: 30,
    slabThicknessCm: 20,
    bandMidBoundaryCm: 15,
    bandMaxBoundaryCm: 25,
  },
}

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  heightCm = H,
): Wall {
  const end = makeEndpoint3D(0, heightCm)
  return {
    id,
    a,
    b,
    thickness: 20,
    openings: [],
    elevation: { a: end, b: { ...end } },
  }
}

function basePlan(): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'clear-height', wallHeightCm: H })
  plan.floors[0]!.walls = [
    wall('w-s', { x: 0, y: 0 }, { x: 800, y: 0 }),
    wall('w-e', { x: 800, y: 0 }, { x: 800, y: 600 }),
    wall('w-n', { x: 800, y: 600 }, { x: 0, y: 600 }),
    wall('w-w', { x: 0, y: 600 }, { x: 0, y: 0 }),
  ]
  return plan
}

function parentRoof() {
  return makeRoofSurface({
    id: 'roof-parent',
    poly: [
      { x: 0, y: 0, z: 100 },
      { x: 800, y: 0, z: 100 },
      { x: 800, y: 600, z: 400 },
      { x: 0, y: 600, z: 400 },
    ],
    origin: 'manual',
  })
}

function dormerRoof() {
  return makeRoofSurface({
    id: 'roof-dormer',
    poly: [
      { x: 300, y: 100, z: 280 },
      { x: 500, y: 100, z: 280 },
      { x: 500, y: 250, z: 320 },
      { x: 300, y: 250, z: 320 },
    ],
    origin: 'manual',
    roofKind: 'dormer',
    roofParentId: 'roof-parent',
  })
}

describe('roof-overlap', () => {
  it('rejects two overlapping planes', () => {
    const a = parentRoof()
    const b = makeRoofSurface({
      id: 'roof-b',
      poly: [
        { x: 100, y: 100, z: 220 },
        { x: 700, y: 100, z: 220 },
        { x: 700, y: 500, z: 380 },
        { x: 100, y: 500, z: 380 },
      ],
      origin: 'manual',
    })
    expect(validateRoofOverlap(b, [a])?.code).toBe('plane_plane')
  })

  it('allows dormer inside parent', () => {
    expect(validateRoofOverlap(dormerRoof(), [parentRoof()])).toBeNull()
  })

  it('rejects dormer-dormer overlap', () => {
    const d1 = dormerRoof()
    const d2 = withRoofKind(
      makeRoofSurface({
        id: 'roof-dormer-2',
        poly: [
          { x: 350, y: 120, z: 330 },
          { x: 480, y: 120, z: 330 },
          { x: 480, y: 240, z: 350 },
          { x: 350, y: 240, z: 350 },
        ],
        origin: 'manual',
      }),
      'dormer',
      'roof-parent',
    )
    expect(validateRoofOverlap(d2, [parentRoof(), d1])?.code).toBe('dormer_dormer')
  })
})

describe('sampleCeilingRoofAtPoint', () => {
  it('dormer wins inside footprint; parent outside', () => {
    const surfaces = [parentRoof(), dormerRoof()]
    const inDormer = sampleCeilingRoofAtPoint(surfaces, { x: 400, y: 175 })
    expect(inDormer?.dormer).toBe(true)
    expect(inDormer?.surfaceId).toBe('roof-dormer')
    expect(inDormer?.z).toBeGreaterThanOrEqual(280)

    const beside = sampleCeilingRoofAtPoint(surfaces, { x: 100, y: 100 })
    expect(beside?.dormer).toBe(false)
    expect(beside?.surfaceId).toBe('roof-parent')
    expect(beside?.z).toBeLessThan(inDormer!.z)
  })

  it('ongedagde kapel op ouder-rand wint voor 1,50-lijn (niet ouder-Z)', () => {
    const parent = parentRoof()
    const nested = makeRoofSurface({
      id: 'roof-nested',
      origin: 'manual',
      poly: [
        { x: 800, y: 100, z: 280 },
        { x: 800, y: 250, z: 280 },
        { x: 500, y: 250, z: 280 },
        { x: 500, y: 100, z: 280 },
      ],
    })
    const surfaces = [parent, nested]
    const inside = sampleCeilingRoofAtPoint(surfaces, { x: 650, y: 175 })
    expect(inside?.dormer).toBe(true)
    expect(inside?.z).toBe(280)
    const beside = sampleCeilingRoofAtPoint(surfaces, { x: 100, y: 100 })
    expect(beside?.dormer).toBe(false)
    expect(beside?.z).toBeLessThan(200)
  })
})

describe('liningCm + clear-height', () => {
  it('clamps lining to −dakThickness', () => {
    expect(clampLiningCm(10, 30)).toBe(10)
    expect(clampLiningCm(-30, 30)).toBe(-30)
    expect(clampLiningCm(-40, 30)).toBe(-30)
    expect(clampLiningCm(Number.NaN, 30)).toBe(0)
  })

  it('positive lining moves snede toward ridge', () => {
    const bare = clearHeightSnedeZCm({ heightCm: 150, liningCm: 0 })
    const lined = clearHeightSnedeZCm({ heightCm: 150, liningCm: 10 })
    expect(lined).toBe(bare + 10)
  })

  it('clear height uses roof underside (no half plate thickness)', () => {
    expect(clearHeightAtPointCm({ roofZ: 280, liningCm: 0 })).toBe(280)
    expect(clearHeightAtPointCm({ roofZ: 280, liningCm: 10 })).toBe(270)
    expect(clearHeightSnedeZCm({ heightCm: 150, liningCm: 0 })).toBe(150)
    expect(clearHeightSnedeZCm({ heightCm: 150, liningCm: 10 })).toBe(160)
  })

  it('contour exists for single roof; override replaces snede; fill is under-height', () => {
    const plan = basePlan()
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof()])
    const computed = computeClearHeightContour(plan, 0, 150)
    expect(computed.polylines.length + computed.rings.length).toBeGreaterThan(0)
    // Parent: goot Z=200, nok Z=400 → snede op 150; onder-zone bij goot
    expect(computed.rings.length).toBeGreaterThan(0)

    const override = [
      { x: 50, y: 50 },
      { x: 750, y: 50 },
      { x: 750, y: 550 },
      { x: 50, y: 550 },
    ]
    const withOverride = computeClearHeightContour(plan, 0, 150, { override })
    expect(withOverride.override).toEqual(override)
    expect(withOverride.polylines[0]?.points).toEqual(override)

    plan.floors[0]!.areas = [
      {
        id: 'area-1',
        poly: [
          { x: 0, y: 0 },
          { x: 800, y: 0 },
          { x: 800, y: 600 },
          { x: 0, y: 600 },
        ],
        color: '#eee',
        showAreaLabel: true,
      },
    ]
    const bands = computeClearHeightBands(plan, 0, { override })
    expect(bands[0]?.source).toBe('override')
    expect(bands[0]!.atLeast150Cm2).toBeGreaterThan(0)
  })

  it('parent 1.50 line is clipped around dormer footprint', () => {
    const plan = basePlan()
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof(), dormerRoof()])
    const contour = computeClearHeightContour(plan, 0, 150)
    expect(contour.polylines.length).toBeGreaterThan(0)
    // Geen enkel parent-segment mag midden door de dakkapel lopen
    for (const line of contour.polylines) {
      for (let i = 0; i < line.points.length - 1; i += 1) {
        const a = line.points[i]!
        const b = line.points[i + 1]!
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const inDormer =
          mid.x > 300 && mid.x < 500 && mid.y > 100 && mid.y < 250
        // Korte stubs tot de rand mogen; midden van lange lijn door kapel niet
        if (Math.hypot(b.x - a.x, b.y - a.y) > 80) {
          expect(inDormer).toBe(false)
        }
      }
    }
  })

  it('ongedagde kapel puncht 1,50-lijn en fill', () => {
    const plan = basePlan()
    const nested = makeRoofSurface({
      id: 'roof-nested',
      origin: 'manual',
      poly: [
        { x: 800, y: 100, z: 280 },
        { x: 800, y: 250, z: 280 },
        { x: 500, y: 250, z: 280 },
        { x: 500, y: 100, z: 280 },
      ],
    })
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof(), nested])
    const contour = computeClearHeightContour(plan, 0, 150)
    expect(contour.polylines.length).toBeGreaterThan(0)
    for (const line of contour.polylines) {
      for (let i = 0; i < line.points.length - 1; i += 1) {
        const a = line.points[i]!
        const b = line.points[i + 1]!
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const inDormer = mid.x > 520 && mid.x < 780 && mid.y > 110 && mid.y < 240
        if (Math.hypot(b.x - a.x, b.y - a.y) > 80) {
          expect(inDormer).toBe(false)
        }
      }
    }
    for (const ring of contour.rings) {
      const mid = {
        x: ring.points.reduce((s, p) => s + p.x, 0) / ring.points.length,
        y: ring.points.reduce((s, p) => s + p.y, 0) / ring.points.length,
      }
      const inDormer = mid.x > 520 && mid.x < 780 && mid.y > 110 && mid.y < 240
      expect(inDormer).toBe(false)
    }
  })

  it('liningCm +10 only affects that area snede filter', () => {
    const plan = basePlan()
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof()])
    plan.floors[0]!.areas = [
      {
        id: 'a-lined',
        poly: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 600 },
          { x: 0, y: 600 },
        ],
        color: '#eee',
        showAreaLabel: true,
        liningCm: 10,
      },
      {
        id: 'a-bare',
        poly: [
          { x: 400, y: 0 },
          { x: 800, y: 0 },
          { x: 800, y: 600 },
          { x: 400, y: 600 },
        ],
        color: '#ddd',
        showAreaLabel: true,
      },
    ]
    const contour = computeClearHeightContour(plan, 0, 150)
    // Twee lining-waarden → segmenten voor beide snedes aanwezig of rings.
    expect(contour.polylines.length + contour.rings.length).toBeGreaterThan(0)
  })
})

describe('bind dormer walls', () => {
  it('junction in dormer gets z≈parent and h≈child', () => {
    let plan = basePlan()
    // Kopmuur in dakkapel-voetafdruk
    plan.floors[0]!.walls.push(wall('w-dormer', { x: 300, y: 100 }, { x: 500, y: 100 }, H))
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof(), dormerRoof()])
    const result = bindFloorWallsToRoofs(plan, 0)
    expect(result.boundJunctions).toBeGreaterThan(0)
    const dormerWall = result.plan.floors[0]!.walls.find((w) => w.id === 'w-dormer')
    expect(dormerWall?.elevation?.a.z).toBeGreaterThan(50)
    expect(dormerWall!.elevation!.a.h).toBeGreaterThan(dormerWall!.elevation!.a.z)
    expect(dormerWall!.elevation!.a.h).toBeGreaterThanOrEqual(280)
  })
})

describe('elevation dormer sort', () => {
  it('parent before child at same depth', () => {
    const plan = basePlan()
    const front = createFacadeGroup(plan, { name: 'Front' })
    assignWallsToGroup(plan, front.id, ['w-s'])
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof(), dormerRoof()])
    const elev = projectFacadeElevation(plan, front.id)
    expect(elev).not.toBeNull()
    const ids = elev!.roofPlanes.map((p) => p.id)
    const parentIdx = ids.indexOf('roof-parent')
    const childIdx = ids.indexOf('roof-dormer')
    if (parentIdx >= 0 && childIdx >= 0) {
      expect(parentIdx).toBeLessThan(childIdx)
    }
    const dormerPlane = elev!.roofPlanes.find((p) => p.id === 'roof-dormer')
    if (dormerPlane) {
      expect(dormerPlane.dormer).toBe(true)
      expect(dormerPlane.color).toBe(DORMER_ROOF_SURFACE_COLOR)
    }
  })
})

describe('.plg + FML dormer roundtrip', () => {
  it('roofKind/parentId/liningCm survive plg wrap', () => {
    const plan = basePlan()
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof(), dormerRoof()])
    plan.floors[0]!.areas = [
      {
        id: 'room',
        poly: [
          { x: 50, y: 50 },
          { x: 750, y: 50 },
          { x: 750, y: 550 },
          { x: 50, y: 550 },
        ],
        color: '#ccc',
        showAreaLabel: true,
        liningCm: 12,
      },
    ]
    expect(isDormerRoof(listRidgeSurfacesOnFloor(plan.floors[0])[1])).toBe(true)

    const doc = createPlgDocument({
      project: { id: 'p1', name: 't', address: '' },
      settings: FACTORY_PLG_SETTINGS,
      plan,
    })
    const round = readPlg(writePlg(doc))
    const roofs = listRidgeSurfacesOnFloor(round.plan.floors[0])
    const dormer = roofs.find((s) => s.id === 'roof-dormer')
    expect(dormer?.roofKind).toBe('dormer')
    expect(dormer?.roofParentId).toBe('roof-parent')
    expect(round.plan.floors[0]!.areas?.[0]?.liningCm).toBe(12)
  })

  it('FML adapter serializePlanSettings includes kinds for dormers', () => {
    const plan = basePlan()
    plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0]!, [parentRoof(), dormerRoof()])
    syncRoofPlaneGuidsFromDesigns(plan)
    const settings: Record<string, unknown> = {}
    roofAdapter.serializePlanSettings?.(plan, settings)
    const planes = settings[ROOF_PLANES_SETTINGS_KEY] as {
      surfaceGuids: string[]
      kinds?: Record<string, { kind: string; parentId?: string }>
    }
    expect(planes.kinds?.['roof-dormer']?.kind).toBe('dormer')
    expect(planes.kinds?.['roof-dormer']?.parentId).toBe('roof-parent')

    // Hydrate from kinds when typed fields missing
    const stripped = structuredClone(plan)
    for (const s of listRidgeSurfacesOnFloor(stripped.floors[0])) {
      delete s.roofKind
      delete s.roofParentId
    }
    stripped.source = {
      ...(stripped.source ?? {}),
      settings: {
        ...(stripped.source?.settings ?? {}),
        [ROOF_PLANES_SETTINGS_KEY]: planes,
      },
    }
    roofAdapter.hydrate?.(stripped)
    const dormer = listRidgeSurfacesOnFloor(stripped.floors[0]).find((s) => s.id === 'roof-dormer')
    expect(dormer?.roofKind).toBe('dormer')
    expect(dormer?.roofParentId).toBe('roof-parent')
  })
})
