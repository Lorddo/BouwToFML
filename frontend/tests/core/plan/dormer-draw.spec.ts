import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import {
  applyDormerDrawToPlan,
  dormerDepthPoint,
  dormerFrontCenterlineFromInner,
  isDormerRoleWall,
  projectDormerFootprint,
} from '@/core/plan/dormer-draw'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import { isRidgeWall } from '@/core/plan/ridge-walls'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  readRoofPlanesSettings,
  setRidgeSurfacesOnFloor,
  syncRoofPlaneGuidsFromDesigns,
} from '@/core/plan/roof-planes'
import type { FloorPlan, Wall } from '@/core/plan/types'
import { addWallSegment } from '@/core/plan/wall-draw-geom'
import {
  buildWallRenderGeometry,
  pointInFillComponents,
} from '@/core/plan/wall-render-geometry'

function place(args?: {
  plan?: FloorPlan
  frontA?: { x: number; y: number }
  frontB?: { x: number; y: number }
  depthPoint?: { x: number; y: number }
  thicknessCm?: number
  roofZCm?: number
  bottomZCm?: number
}) {
  const plan = args?.plan ?? createEmptyFloorPlan({ wallHeightCm: 280 })
  return applyDormerDrawToPlan(plan, 0, {
    frontA: args?.frontA ?? { x: 40, y: 40 },
    frontB: args?.frontB ?? { x: 160, y: 40 },
    depthPoint: args?.depthPoint ?? { x: 100, y: 120 },
    thicknessCm: args?.thicknessCm ?? 20,
    roofZCm: args?.roofZCm ?? 280,
    bottomZCm: args?.bottomZCm ?? 0,
  })
}

describe('dakkapel-teken macro', () => {
  it('binnenmaat + wang 0,5 → hartlijn I + T', () => {
    expect(dormerFrontCenterlineFromInner(200, 20)).toBe(220)
  })

  it('dormerDepthPoint zet diepte haaks, zelfde kant als toward', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 200, y: 0 }
    const down = dormerDepthPoint(a, b, { x: 80, y: 10 }, 90)
    const up = dormerDepthPoint(a, b, { x: 80, y: -10 }, 90)
    expect(down.x).toBeCloseTo(100, 5)
    expect(down.y).toBeCloseTo(90, 5)
    expect(up.x).toBeCloseTo(100, 5)
    expect(up.y).toBeCloseTo(-90, 5)
  })

  it('P3 beide zijden haaks op de voorzijde', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 200, y: 0 }
    const down = projectDormerFootprint(a, b, { x: 80, y: 90 })
    const up = projectDormerFootprint(a, b, { x: 80, y: -90 })
    expect(down?.depthCm).toBeCloseTo(90, 5)
    expect(down?.backA.y).toBeCloseTo(90, 5)
    expect(down?.backB.y).toBeCloseTo(90, 5)
    expect(up?.depthCm).toBeCloseTo(90, 5)
    expect(up?.backA.y).toBeCloseTo(-90, 5)
    expect(up?.poly).toHaveLength(4)
  })

  it('schrijft U: kopse naar buiten, wangen 0,5, role dormer', () => {
    const result = place()
    expect(result).not.toBeNull()
    const walls = result!.plan.floors[0].walls
    expect(walls.length).toBeGreaterThanOrEqual(3)
    expect(walls.every((wall) => isDormerRoleWall(wall))).toBe(true)
    expect(walls.every((wall) => !isRidgeWall(wall))).toBe(true)
    const front = walls.filter((wall) => Math.abs(wall.a.y - 40) < 0.6 && Math.abs(wall.b.y - 40) < 0.6)
    const wangs = walls.filter((wall) => !front.includes(wall))
    expect(front.length).toBeGreaterThanOrEqual(1)
    expect(front.every((wall) => wall.balance === 0 || wall.balance === 1)).toBe(true)
    expect(wangs.every((wall) => wall.balance === 0.5)).toBe(true)
  })

  it('kindvlak ligt op wang-buitenfaces, niet op hartlijnen', () => {
    const result = place({ thicknessCm: 20 })
    expect(result).not.toBeNull()
    const roof = listRidgeSurfacesOnFloor(result!.plan.floors[0]).find((s) => s.roofKind === 'dormer')
    expect(roof).toBeTruthy()
    const xs = roof!.poly.map((p) => p.x).sort((a, b) => a - b)
    const ys = roof!.poly.map((p) => p.y).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(30, 3)
    expect(xs[xs.length - 1]).toBeCloseTo(170, 3)
    expect(ys[0]).toBeCloseTo(40, 3)
    expect(ys[ys.length - 1]).toBeCloseTo(120, 3)
    const wangs = result!.plan.floors[0].walls.filter((wall) => Math.abs(wall.a.x - wall.b.x) < 0.6)
    expect(wangs.some((wall) => Math.abs(wall.a.x - 40) < 0.6)).toBe(true)
  })

  it('wang-fill steekt niet voorbij diepte-eind (butt I-eind)', () => {
    const result = place({
      frontA: { x: 40, y: 40 },
      frontB: { x: 160, y: 40 },
      depthPoint: { x: 100, y: 120 },
      thicknessCm: 20,
    })
    expect(result).not.toBeNull()
    const walls = result!.plan.floors[0].walls
    const geometry = buildWallRenderGeometry(
      walls.map((w) => ({
        id: w.id,
        a: w.a,
        b: w.b,
        thickness: w.thickness,
        balance: w.balance,
      })),
    )
    // Depth back at y=120; half-thickness past that along +Y must be empty
    expect(pointInFillComponents({ x: 40, y: 130 }, geometry.fillComponents)).toBe(false)
    expect(pointInFillComponents({ x: 160, y: 130 }, geometry.fillComponents)).toBe(false)
    // On the wang axis near the back end still filled
    expect(pointInFillComponents({ x: 40, y: 110 }, geometry.fillComponents)).toBe(true)
  })

  it('wees-vlak zonder parent; surface op Dak-design', () => {
    const result = place()
    expect(result).not.toBeNull()
    const floor = result!.plan.floors[0]
    expect(floor.surfaces?.some((s) => s.roofKind === 'dormer')).toBeFalsy()
    const roofs = listRidgeSurfacesOnFloor(floor)
    expect(roofs).toHaveLength(1)
    expect(roofs[0].roofKind).toBe('dormer')
    expect(roofs[0].roofParentId).toBeUndefined()
    expect(roofs[0].isRoof).toBe(true)
    expect(roofs[0].poly.every((p) => p.z === 280)).toBe(true)
    expect(readRoofPlanesSettings(result!.plan).surfaceIds).toContain(result!.surfaceId)
  })

  it('ouder aanwezig → roofParentId', () => {
    let plan = createEmptyFloorPlan({ wallHeightCm: 280 })
    const parent = makeRoofSurface({
      id: 'main',
      origin: 'manual',
      roofKind: 'plane',
      poly: [
        { x: 0, y: 0, z: 200 },
        { x: 400, y: 0, z: 200 },
        { x: 400, y: 300, z: 200 },
        { x: 0, y: 300, z: 200 },
      ],
    })
    plan = {
      ...plan,
      floors: [setRidgeSurfacesOnFloor(plan.floors[0], [parent])],
    }
    syncRoofPlaneGuidsFromDesigns(plan)
    const result = place({ plan })
    expect(result).not.toBeNull()
    const child = listRidgeSurfacesOnFloor(result!.plan.floors[0]).find((s) => s.roofKind === 'dormer')
    expect(child?.roofParentId).toBe('main')
  })

  it('voorzijde over een kruisende binnenmuur → T-split', () => {
    let plan = createEmptyFloorPlan({ wallHeightCm: 280 })
    const split = addWallSegment(
      plan.floors[0].walls,
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      10,
      280,
    )
    expect(split).not.toBeNull()
    plan = { ...plan, floors: [{ ...plan.floors[0], walls: split!.walls }] }
    const result = place({ plan })
    expect(result).not.toBeNull()
    const front = result!.plan.floors[0].walls.filter(
      (wall) =>
        isDormerRoleWall(wall) &&
        Math.abs(wall.a.y - 40) < 0.6 &&
        Math.abs(wall.b.y - 40) < 0.6,
    )
    expect(front.length).toBeGreaterThanOrEqual(2)
  })

  it('FML: gewone muren zonder ridge; kindvlak is isRoof op Dak; geen fixture', () => {
    const result = place()
    expect(result).not.toBeNull()
    const raw = JSON.parse(buildFmlV3(result!.plan)) as {
      floors: Array<{
        designs?: Array<{
          name?: string
          walls?: Array<{ extras?: { ridge?: boolean } }>
          surfaces?: Array<{ isRoof?: boolean }>
          items?: Array<{ kind?: string }>
        }>
      }>
    }
    const designs = raw.floors[0].designs ?? []
    const planDesign = designs[0]
    const dak = designs.find((d) => d.name === 'Dak')
    expect(planDesign?.walls?.some((w) => w.extras?.ridge === true)).toBeFalsy()
    expect(dak?.surfaces?.some((s) => s.isRoof === true)).toBe(true)
    expect(planDesign?.items?.some((item) => item.kind === 'dormer')).toBeFalsy()
    expect(dak?.items?.some((item) => item.kind === 'dormer')).toBeFalsy()
  })
})

describe('isRidgeWall vs dormer-role', () => {
  it('role dormer is geen nok', () => {
    const wall: Wall = {
      id: 'd',
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      thickness: 20,
      role: 'dormer',
      openings: [],
    }
    expect(isRidgeWall(wall)).toBe(false)
    expect(isDormerRoleWall(wall)).toBe(true)
  })
})
