import { describe, expect, it } from 'vitest'
import { applyDormerDrawToPlan, isDormerRoleWall } from '@/core/plan/dormer-draw'
import {
  syncDormerRoofPolysFromWalls,
  weldDormerAssemblyCorners,
} from '@/core/plan/dormer-follow-roof'
import { slideWallSegmentAlongAxis } from '@/core/plan/wall-slide'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import {
  listRidgeSurfacesOnFloor,
  makeRoofSurface,
  mapRidgeSurfaceOnPlan,
  followDormerWallsForSurfaceMove,
  setRidgeSurfaceVertex,
  setRidgeSurfaceVertexZ,
  setRidgeSurfaceVertices,
  setRidgeSurfacesOnFloor,
} from '@/core/plan/roof-planes'
import type { Point2D, Wall } from '@/core/plan/types'

function place() {
  const plan = createEmptyFloorPlan({ wallHeightCm: 280 })
  return applyDormerDrawToPlan(plan, 0, {
    frontA: { x: 40, y: 40 },
    frontB: { x: 160, y: 40 },
    depthPoint: { x: 100, y: 120 },
    thicknessCm: 20,
    roofZCm: 280,
  })
}

function dormerPoly(plan: ReturnType<typeof place> extends infer R ? (R extends { plan: infer P } ? P : never) : never) {
  return listRidgeSurfacesOnFloor(plan.floors[0]).find((s) => s.roofKind === 'dormer')
}

function translatePoly(poly: Point2D[], dx: number, dy: number) {
  return poly.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
}

describe('dakkapel-muren volgen kindvlak', () => {
  it('hele vlak +50,+30 schuift kopse én wangen mee', () => {
    const result = place()
    expect(result).not.toBeNull()
    const surface = dormerPoly(result!.plan)
    expect(surface).toBeTruthy()
    const oldPoly = surface!.poly.map((p) => ({ ...p }))
    const moved = mapRidgeSurfaceOnPlan(result!.plan, surface!.id, (s) => ({
      ...s,
      poly: translatePoly(s.poly, 50, 30),
    }))
    expect(moved.floors[0].walls.filter(isDormerRoleWall)[0]!.a.x).toBeCloseTo(
      result!.plan.floors[0].walls.filter(isDormerRoleWall)[0]!.a.x,
      4,
    )
    const next = followDormerWallsForSurfaceMove(moved, surface!.id, oldPoly)
    const walls = next.floors[0].walls.filter(isDormerRoleWall)
    expect(walls).toHaveLength(result!.plan.floors[0].walls.filter(isDormerRoleWall).length)
    for (const wall of walls) {
      const before = result!.plan.floors[0].walls.find((w) => w.id === wall.id)
      expect(before).toBeTruthy()
      expect(wall.a.x).toBeCloseTo(before!.a.x + 50, 4)
      expect(wall.a.y).toBeCloseTo(before!.a.y + 30, 4)
      expect(wall.b.x).toBeCloseTo(before!.b.x + 50, 4)
      expect(wall.b.y).toBeCloseTo(before!.b.y + 30, 4)
    }
  })

  it('diepte-hoek verslepen verlengt de wang, kopse blijft', () => {
    const result = place()
    expect(result).not.toBeNull()
    const surface = dormerPoly(result!.plan)!
    const backAIndex = surface.poly.findIndex((p) => Math.abs(p.x - 30) < 0.6 && Math.abs(p.y - 120) < 0.6)
    expect(backAIndex).toBeGreaterThanOrEqual(0)
    const oldPoly = surface.poly.map((p) => ({ ...p }))
    const moved = setRidgeSurfaceVertex(result!.plan, surface.id, backAIndex, { x: 30, y: 180 })
    const next = followDormerWallsForSurfaceMove(moved, surface.id, oldPoly)
    const before = result!.plan.floors[0].walls
    const after = next.floors[0].walls
    const frontBefore = before.filter(
      (w) => isDormerRoleWall(w) && Math.abs(w.a.y - 40) < 0.6 && Math.abs(w.b.y - 40) < 0.6,
    )
    const frontAfter = after.filter(
      (w) => isDormerRoleWall(w) && Math.abs(w.a.y - 40) < 0.6 && Math.abs(w.b.y - 40) < 0.6,
    )
    expect(frontAfter).toHaveLength(frontBefore.length)
    const wang = after.find(
      (w) =>
        isDormerRoleWall(w) &&
        ((Math.abs(w.a.x - 40) < 0.6 && Math.abs(w.b.x - 40) < 0.6) ||
          (Math.abs(w.a.x - 40) < 0.6 && Math.abs(w.b.x - 40) < 0.6)),
    )
    expect(wang).toBeTruthy()
    const ys = [wang!.a.y, wang!.b.y].sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(40, 3)
    expect(ys[1]).toBeCloseTo(180, 3)
  })

  it('handmatige wangen zonder role volgen het vlak', () => {
    let plan = createEmptyFloorPlan({ wallHeightCm: 280 })
    const walls: Wall[] = [
      {
        id: 'front',
        a: { x: 100, y: 0 },
        b: { x: 250, y: 0 },
        thickness: 20,
        balance: 1,
        openings: [],
      },
      {
        id: 'wang-l',
        a: { x: 100, y: 0 },
        b: { x: 100, y: 120 },
        thickness: 20,
        balance: 0.5,
        openings: [],
      },
      {
        id: 'wang-r',
        a: { x: 250, y: 0 },
        b: { x: 250, y: 120 },
        thickness: 20,
        balance: 0.5,
        openings: [],
      },
    ]
    plan = {
      ...plan,
      floors: [
        setRidgeSurfacesOnFloor(
          { ...plan.floors[0], walls },
          [
            makeRoofSurface({
              id: 'd1',
              origin: 'manual',
              roofKind: 'dormer',
              poly: [
                { x: 90, y: 0, z: 280 },
                { x: 260, y: 0, z: 280 },
                { x: 260, y: 120, z: 280 },
                { x: 90, y: 120, z: 280 },
              ],
            }),
          ],
        ),
      ],
    }
    const oldPoly = listRidgeSurfacesOnFloor(plan.floors[0]).find((s) => s.id === 'd1')!.poly
    const mapped = mapRidgeSurfaceOnPlan(plan, 'd1', (s) => ({
      ...s,
      poly: translatePoly(s.poly, 40, 15),
    }))
    const next = followDormerWallsForSurfaceMove(mapped, 'd1', oldPoly)
    const moved = next.floors[0].walls
    expect(moved.find((w) => w.id === 'wang-l')!.a).toEqual({ x: 140, y: 15 })
    expect(moved.find((w) => w.id === 'wang-r')!.b).toEqual({ x: 290, y: 135 })
    expect(moved.find((w) => w.id === 'front')!.a).toEqual({ x: 140, y: 15 })
  })

  it('dakkapel-sleep laat ouder-gevel staan', () => {
    const result = place()
    expect(result).not.toBeNull()
    const surface = dormerPoly(result!.plan)!
    const outer: Wall = {
      id: 'outer',
      a: { x: 0, y: 0 },
      b: { x: 0, y: 400 },
      thickness: 20,
      openings: [],
    }
    const withOuter = {
      ...result!.plan,
      floors: [
        {
          ...result!.plan.floors[0],
          walls: [...result!.plan.floors[0].walls, outer],
        },
      ],
    }
    const oldPoly = surface.poly.map((p) => ({ ...p }))
    const mapped = mapRidgeSurfaceOnPlan(withOuter, surface.id, (s) => ({
      ...s,
      poly: translatePoly(s.poly, 50, 30),
    }))
    const next = followDormerWallsForSurfaceMove(mapped, surface.id, oldPoly)
    const after = next.floors[0].walls.find((w) => w.id === 'outer')!
    expect(after.a).toEqual({ x: 0, y: 0 })
    expect(after.b).toEqual({ x: 0, y: 400 })
    const wang = next.floors[0].walls.find(
      (w) => isDormerRoleWall(w) && Math.abs(w.a.x - w.b.x) < 1,
    )
    expect(wang).toBeTruthy()
    const before = result!.plan.floors[0].walls.find((w) => w.id === wang!.id)
    expect(wang!.a.x).toBeCloseTo((before?.a.x ?? 0) + 50, 4)
  })

  it('wang verschuiven neemt het dakvlak mee naar de buitenface', () => {
    const result = place()
    expect(result).not.toBeNull()
    const floor = result!.plan.floors[0]
    const surface = dormerPoly(result!.plan)!
    const walls = floor.walls.map((wall) => {
      if (!isDormerRoleWall(wall)) return wall
      if (Math.abs(wall.a.x - 40) > 0.6 || Math.abs(wall.b.x - 40) > 0.6) return wall
      return {
        ...wall,
        a: { ...wall.a, x: wall.a.x - 20 },
        b: { ...wall.b, x: wall.b.x - 20 },
      }
    })
    const next = syncDormerRoofPolysFromWalls(walls, [surface])
    expect(next).not.toBeNull()
    const xs = next![0].poly.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(10, 2)
  })

  function sharedCorner(a: Wall, b: Wall): boolean {
    const pts = [a.a, a.b]
    return pts.some((p) => [b.a, b.b].some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.2))
  }

  it('voorzijde-slide houdt wang aan de hoek', () => {
    const result = place()
    expect(result).not.toBeNull()
    const surface = dormerPoly(result!.plan)!
    const front = result!.plan.floors[0].walls.find(
      (w) =>
        isDormerRoleWall(w) && Math.abs(w.a.y - 40) < 0.6 && Math.abs(w.b.y - 40) < 0.6,
    )
    expect(front).toBeTruthy()
    const slid = slideWallSegmentAlongAxis(result!.plan.floors[0].walls, front!.id, 25, {
      x: 0,
      y: 1,
    })
    const welded = weldDormerAssemblyCorners(slid, surface.poly)
    const nextFront = welded.find((w) => w.id === front!.id)!
    const wangs = welded.filter(
      (w) => isDormerRoleWall(w) && w.id !== front!.id && Math.abs(w.a.x - w.b.x) < 0.6,
    )
    expect(wangs.length).toBeGreaterThanOrEqual(2)
    for (const wang of wangs) {
      expect(sharedCorner(nextFront, wang)).toBe(true)
    }
  })

  it('losgetrokken hoek last weer op het hartlijn-snijpunt', () => {
    const result = place()
    expect(result).not.toBeNull()
    const surface = dormerPoly(result!.plan)!
    const front = result!.plan.floors[0].walls.find(
      (w) =>
        isDormerRoleWall(w) && Math.abs(w.a.y - 40) < 0.6 && Math.abs(w.b.y - 40) < 0.6,
    )!
    const split = result!.plan.floors[0].walls.map((wall) => {
      if (wall.id !== front.id) return wall
      return {
        ...wall,
        a: { x: wall.a.x, y: wall.a.y - 20 },
        b: { x: wall.b.x, y: wall.b.y - 20 },
      }
    })
    expect(
      split
        .filter((w) => isDormerRoleWall(w) && w.id !== front.id)
        .some((wang) => !sharedCorner(split.find((w) => w.id === front.id)!, wang)),
    ).toBe(true)
    const welded = weldDormerAssemblyCorners(split, surface.poly)
    const nextFront = welded.find((w) => w.id === front.id)!
    const wangs = welded.filter((w) => isDormerRoleWall(w) && w.id !== front.id)
    for (const wang of wangs) {
      expect(sharedCorner(nextFront, wang)).toBe(true)
    }
  })

  it('alleen Z wijzigen laat XY van de muren met rust', () => {
    const result = place()
    expect(result).not.toBeNull()
    const surface = dormerPoly(result!.plan)!
    const next = setRidgeSurfaceVertexZ(result!.plan, surface.id, 0, 320)
    const before = result!.plan.floors[0].walls.filter(isDormerRoleWall)
    const after = next.floors[0].walls.filter(isDormerRoleWall)
    expect(after).toHaveLength(before.length)
    for (const wall of after) {
      const prev = before.find((w) => w.id === wall.id)!
      expect(wall.a).toEqual(prev.a)
      expect(wall.b).toEqual(prev.b)
    }
  })

  it('followDormerWalls:false laat wangen staan; sync bij followDormerWallsForSurfaceMove', () => {
    const result = place()
    expect(result).not.toBeNull()
    const surface = dormerPoly(result!.plan)!
    const startPoly = surface.poly.map((p) => ({ x: p.x, y: p.y, z: p.z }))
    const wallsBefore = result!.plan.floors[0].walls.filter(isDormerRoleWall)

    const duringDrag = setRidgeSurfaceVertices(
      result!.plan,
      surface.id,
      surface.poly.map((_, vertexIndex) => ({
        vertexIndex,
        x: startPoly[vertexIndex]!.x + 40,
        y: startPoly[vertexIndex]!.y + 20,
      })),
      { followDormerWalls: false },
    )
    const wallsDuring = duringDrag.floors[0].walls.filter(isDormerRoleWall)
    expect(wallsDuring).toHaveLength(wallsBefore.length)
    for (const wall of wallsDuring) {
      const prev = wallsBefore.find((w) => w.id === wall.id)!
      expect(wall.a).toEqual(prev.a)
      expect(wall.b).toEqual(prev.b)
    }
    const moved = listRidgeSurfacesOnFloor(duringDrag.floors[0]).find((s) => s.id === surface.id)!
    expect(moved.poly[0]!.x).toBeCloseTo(startPoly[0]!.x + 40, 4)

    const afterRelease = followDormerWallsForSurfaceMove(duringDrag, surface.id, startPoly)
    const wallsAfter = afterRelease.floors[0].walls.filter(isDormerRoleWall)
    for (const wall of wallsAfter) {
      const prev = wallsBefore.find((w) => w.id === wall.id)!
      expect(wall.a.x).toBeCloseTo(prev.a.x + 40, 4)
      expect(wall.a.y).toBeCloseTo(prev.a.y + 20, 4)
      expect(wall.b.x).toBeCloseTo(prev.b.x + 40, 4)
      expect(wall.b.y).toBeCloseTo(prev.b.y + 20, 4)
    }
  })
})
