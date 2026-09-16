import { describe, expect, it } from 'vitest'
import {
  bindFloorWallsToRoofs,
  sampleRoofZAtPoint,
} from '@/core/plan/bind-walls-to-roofs'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import {
  elevDeltaToPlanDelta,
  moveSkylightFromElevation,
  resizeSkylightFromElevation,
  skylightElevBounds,
} from '@/core/plan/elevation-skylight-edit'
import { elevationRoofFillRings } from '@/core/plan/elevation-paint'
import { projectFacadeElevation } from '@/core/plan/facade-elevation'
import {
  bindSkylightToRoofs,
  isSkylightItem,
  sampleSkylightOnRoof,
  skylightFootprintCorners,
} from '@/core/plan/skylight-roof'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  markRoofSurfaceManual,
  setRidgeSurfacesOnFloor,
} from '@/core/plan/roof-planes'
import type { FloorItem, FloorPlan, Wall } from '@/core/plan/types'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { BTF_ROOF_SURFACE_ID_EXTRA } from '@/core/plg/fml-adapter/fixture-kind'
import { ensureDesignsSynced } from '@/core/plan/design-sync'

function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Wall {
  return {
    id,
    a,
    b,
    thickness: 20,
    openings: [],
    extras: { az: { z: 0, h: 280 }, bz: { z: 0, h: 280 } },
  }
}

function withFrontGroup(plan: FloorPlan): FloorPlan {
  plan.facadeGroups = [
    {
      id: 'front',
      code: 'front',
      name: 'Front',
      wallIds: ['front'],
    },
  ]
  return plan
}

/** Zadeldak 400×800: zuid helling y=0→400, Z 280→380. */
function saddleWithSkylight(opts?: {
  skylight?: Partial<FloorItem>
  withUpperFloor?: boolean
}): FloorPlan {
  const plan = createEmptyFloorPlan({ name: 'Skylight', wallHeightCm: 280 })
  plan.floors[0].walls = [
    wall('front', { x: 0, y: 0 }, { x: 400, y: 0 }),
    wall('back', { x: 0, y: 800 }, { x: 400, y: 800 }),
    wall('left', { x: 0, y: 0 }, { x: 0, y: 800 }),
    wall('right', { x: 400, y: 0 }, { x: 400, y: 800 }),
  ]
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
  plan.floors[0] = setRidgeSurfacesOnFloor(plan.floors[0], [south, north])
  plan.floors[0].items = [
    {
      id: 'sky-1',
      kind: 'skylight',
      x: 200,
      y: 200,
      width: 80,
      height: 80,
      rotation: 0,
      mirrored: [0, 0],
      name: 'Dakraam',
      ...opts?.skylight,
    },
  ]
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
            { x: 20, y: 20 },
            { x: 380, y: 20 },
            { x: 380, y: 780 },
            { x: 20, y: 780 },
          ],
          color: '#ccc',
          showAreaLabel: false,
        },
      ],
    })
  }
  return plan
}

describe('skylight-roof', () => {
  it('isSkylightItem + footprint corners', () => {
    const item = {
      kind: 'skylight' as const,
      x: 100,
      y: 100,
      width: 80,
      height: 60,
      rotation: 0,
    }
    expect(isSkylightItem(item)).toBe(true)
    const corners = skylightFootprintCorners(item)
    expect(corners).toHaveLength(4)
    expect(corners[0]).toEqual({ x: 60, y: 70 })
    expect(corners[2]).toEqual({ x: 140, y: 130 })
  })

  it('sampleSkylightOnRoof vindt helling-Z', () => {
    const plan = saddleWithSkylight()
    const surfaces = listRidgeSurfacesOnFloor(plan.floors[0])
    const item = plan.floors[0].items![0]!
    const sampled = sampleSkylightOnRoof(surfaces, item)
    expect(sampled).not.toBeNull()
    expect(sampled!.surfaceId).toBe('roof-s')
    expect(sampled!.centerZ).toBe(sampleRoofZAtPoint(surfaces, { x: 200, y: 200 }))
    const zs = sampled!.corners.map((c) => c.z)
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(5)
  })

  it('bindSkylightToRoofs koppelt surface + z', () => {
    const plan = saddleWithSkylight()
    const surfaces = listRidgeSurfacesOnFloor(plan.floors[0])
    const item = plan.floors[0].items![0]!
    const result = bindSkylightToRoofs(item, surfaces, plan, 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.roofSurfaceId).toBe('roof-s')
    expect(result.item.z).toBeGreaterThan(280)
  })

  it('bindFloorWallsToRoofs telt dakramen mee', () => {
    const plan = saddleWithSkylight()
    const beforeWalls = plan.floors[0].walls.length
    const result = bindFloorWallsToRoofs(plan, 0, { splitCreases: true })
    expect(result.boundSkylights).toBe(1)
    expect(result.skippedSkylights).toBe(0)
    expect(result.plan.floors[0].items![0]!.roofSurfaceId).toBe('roof-s')
    expect(result.plan.floors[0].walls.length).toBeGreaterThanOrEqual(beforeWalls)
  })

  it('bind skip: blocked onder floor+1', () => {
    const plan = saddleWithSkylight({ withUpperFloor: true })
    const result = bindFloorWallsToRoofs(plan, 0, { splitCreases: true })
    expect(result.boundSkylights).toBe(0)
    expect(result.skippedSkylights).toBe(1)
    expect(result.plan.floors[0].items![0]!.roofSurfaceId).toBeUndefined()
  })

  it('bind skip: buiten dakvlak', () => {
    const plan = saddleWithSkylight({ skylight: { x: 900, y: 900 } })
    const result = bindFloorWallsToRoofs(plan, 0)
    expect(result.boundSkylights).toBe(0)
    expect(result.skippedSkylights).toBe(1)
  })
})

describe('skylight elevation', () => {
  it('projecteert gekoppeld dakraam op voorgevel met helling', () => {
    const plan = withFrontGroup(saddleWithSkylight())
    const bound = bindFloorWallsToRoofs(plan, 0)
    const elev = projectFacadeElevation(bound.plan, 'front')
    expect(elev).not.toBeNull()
    expect(elev!.skylights).toHaveLength(1)
    const sky = elev!.skylights[0]!
    expect(sky.surfaceId).toBe('roof-s')
    const ys = sky.points.map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1)
  })

  it('ongekoepeld dakraam verschijnt niet', () => {
    const plan = withFrontGroup(saddleWithSkylight())
    const elev = projectFacadeElevation(plan, 'front')
    expect(elev?.skylights ?? []).toHaveLength(0)
  })

  it('punch: host-dak heeft hole-ring', () => {
    const plan = withFrontGroup(saddleWithSkylight())
    const bound = bindFloorWallsToRoofs(plan, 0)
    const elev = projectFacadeElevation(bound.plan, 'front')!
    const roof = elev.roofPlanes.find((p) => p.id === 'roof-s')
    expect(roof).toBeTruthy()
    const rings = elevationRoofFillRings(roof!, elev.skylights, 'roof-s')
    expect(rings.length).toBe(2)
    const other = elevationRoofFillRings(roof!, elev.skylights, 'roof-n')
    expect(other.length).toBe(1)
  })
})

describe('skylight elev edit', () => {
  it('move langs gevel-as houdt Z-koppeling', () => {
    const plan = saddleWithSkylight()
    const bound = bindFloorWallsToRoofs(plan, 0)
    const item = bound.plan.floors[0].items![0]!
    const surface = listRidgeSurfacesOnFloor(bound.plan.floors[0]).find((s) => s.id === 'roof-s')!
    const elevAxis = { x: 1, y: 0 }
    const moved = moveSkylightFromElevation(item, surface, { x: 40, y: 0 }, elevAxis)
    expect(moved.x).toBeCloseTo(item.x + 40, 0)
    expect(moved.roofSurfaceId).toBe('roof-s')
    expect(typeof moved.z).toBe('number')
  })

  it('Y-sleep langs helling verandert Z', () => {
    const plan = saddleWithSkylight()
    const bound = bindFloorWallsToRoofs(plan, 0)
    const item = bound.plan.floors[0].items![0]!
    const surface = listRidgeSurfacesOnFloor(bound.plan.floors[0]).find((s) => s.id === 'roof-s')!
    const moved = moveSkylightFromElevation(item, surface, { x: 0, y: -20 }, { x: 1, y: 0 })
    expect(moved.y).not.toBeCloseTo(item.y, 0)
    expect(moved.z!).toBeGreaterThan(item.z!)
  })

  it('resize E houdt tegenoverliggende rand', () => {
    const plan = saddleWithSkylight()
    const bound = bindFloorWallsToRoofs(plan, 0)
    const item = bound.plan.floors[0].items![0]!
    const surface = listRidgeSurfacesOnFloor(bound.plan.floors[0]).find((s) => s.id === 'roof-s')!
    const left = item.x - item.width / 2
    const next = resizeSkylightFromElevation(item, surface, 'e', { x: 20, y: 0 }, { x: 1, y: 0 })
    expect(next.width).toBeGreaterThan(item.width)
    expect(next.x - next.width / 2).toBeCloseTo(left, 0)
  })

  it('elevDeltaToPlanDelta plat dak: Y is no-op', () => {
    const delta = elevDeltaToPlanDelta({ x: 10, y: -30 }, { x: 1, y: 0 }, null, 0)
    expect(delta).toEqual({ x: 10, y: 0 })
  })

  it('skylightElevBounds', () => {
    const bounds = skylightElevBounds([
      { x: 0, y: 0 },
      { x: 10, y: -5 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ])
    expect(bounds).toEqual({ x0: 0, x1: 10, y0: -5, y1: 5 })
  })
})

describe('skylight FML adapter', () => {
  it('schrijft btfRoofSurfaceId en hydrateert terug', () => {
    let plan = saddleWithSkylight({
      skylight: { roofSurfaceId: 'roof-s', z: 330 },
    })
    plan = {
      ...plan,
      floors: plan.floors.map((floor) => ensureDesignsSynced(floor)),
    }
    const text = buildFmlV3(plan)
    expect(text).toContain(BTF_ROOF_SURFACE_ID_EXTRA)
    expect(text).toContain('roof-s')
    const imported = importFmlV3(text)
    const floor = imported.plan.floors[0]
    const item =
      floor.items?.find((i) => i.kind === 'skylight') ??
      floor.designs?.flatMap((d) => d.items ?? []).find((i) => i.kind === 'skylight')
    expect(item?.roofSurfaceId).toBe('roof-s')
  })
})
