import { describe, expect, it } from 'vitest'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { projectFacadeElevation } from '@/core/fml/facade-elevation'
import { assignWallsToGroup, createFacadeGroup } from '@/core/fml/facade-groups'
import { addPlanOpening } from '@/core/fml/elevation-openings'
import { markWallAsRidge, ridgeEndpointExtras, setRidgeWallsOnFloor } from '@/core/fml/ridge-walls'
import { buildElevationLinework, clipSegmentAgainstOccluder } from '@/core/fml/elevation-linework'
import { elevationWallFillRings, groupElevationPaintPlanes } from '@/core/fml/elevation-paint'
import { type FloorPlan, type Wall } from '@/core/fml/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall {
  return { id, a, b, thickness: 20, openings: [] }
}

function parallelFacadePlan(): FloorPlan {
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
  return plan
}

describe('elevation-linework', () => {
  it('clipSegment: midden achter occluder verdwijnt; uiteinden buiten blijven', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const geom = [[outer.map((p) => [p.x, p.y] as [number, number]).concat([[0, 0]])]]
    // Use clip via public helper with a real multi built by rings path:
    // horizontal line across the box: left outside, through, right outside
    const pieces = clipSegmentAgainstOccluder({ x: -50, y: 50 }, { x: 150, y: 50 }, geom)
    expect(pieces.length).toBe(2)
    expect(pieces[0][0].x).toBeCloseTo(-50, 5)
    expect(pieces[0][1].x).toBeCloseTo(0, 0)
    expect(pieces[1][0].x).toBeCloseTo(100, 0)
    expect(pieces[1][1].x).toBeCloseTo(150, 5)
  })

  it('twee parallelle dieptes: midden van achtermuur verdwijnt achter voorste baksteen', () => {
    const plan = parallelFacadePlan()
    const elev = projectFacadeElevation(plan, 'G1')!
    const linework = buildElevationLinework(elev)
    const achter = elev.walls.find((item) => item.wallId === 'achter')!
    const midX = (achter.aTop.x + achter.bTop.x) / 2
    const midY = (achter.aTop.y + achter.aBottom.y) / 2

    const wallStrokes = linework.strokes.filter((s) => s.role === 'wall')
    const coversMid = wallStrokes.some((stroke) => {
      for (let i = 0; i < stroke.points.length - 1; i += 1) {
        const a = stroke.points[i]
        const b = stroke.points[i + 1]
        const minX = Math.min(a.x, b.x)
        const maxX = Math.max(a.x, b.x)
        const minY = Math.min(a.y, b.y)
        const maxY = Math.max(a.y, b.y)
        if (midX >= minX - 1 && midX <= maxX + 1 && midY >= minY - 1 && midY <= maxY + 1) {
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len2 = dx * dx + dy * dy
          if (len2 < 1e-6) continue
          const t = ((midX - a.x) * dx + (midY - a.y) * dy) / len2
          if (t < -0.05 || t > 1.05) continue
          const px = a.x + dx * t
          const py = a.y + dy * t
          if (Math.hypot(px - midX, py - midY) < 2) return true
        }
      }
      return false
    })
    expect(coversMid).toBe(false)

    // Voorste muur-outline blijft bestaan (hoeken van serre-baksteen).
    const serre = elev.walls.find((item) => item.wallId === 'serre')!
    const frontCorners = [serre.aTop, serre.bTop, serre.aBottom, serre.bBottom]
    const hasFrontOutline = wallStrokes.some((stroke) =>
      stroke.points.some((p) => frontCorners.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < 3)),
    )
    expect(hasFrontOutline).toBe(true)
    expect(wallStrokes.length).toBeGreaterThan(0)
  })

  it('deur in voorste muur: achtermuur-segment door het gat blijft', () => {
    const plan = parallelFacadePlan()
    const withDoor = addPlanOpening(plan, 'serre', {
      type: 'door',
      kind: 'door.single',
      t: 0.5,
      width: 90,
      z: 0,
      z_height: 220,
      id: 'door-serre',
    })
    const elev = projectFacadeElevation(withDoor.plan, 'G1')!
    const planes = groupElevationPaintPlanes(elev)
    const front = planes.find((p) => p.walls.some((w) => w.wallId === 'serre'))!
    const door = front.openings.find((o) => o.openingGuid === 'door-serre')!
    expect(door).toBeTruthy()

    const achter = elev.walls.find((item) => item.wallId === 'achter')!
    const doorMidX = (door.x0 + door.x1) / 2
    const holeMidY = (door.y0 + door.y1) / 2

    const frontRings = elevationWallFillRings(front.walls[0], [
      ...front.openings,
      ...front.transoms,
    ])
    expect(frontRings.length).toBeGreaterThan(1)

    const probe = clipSegmentAgainstOccluder(
      { x: Math.min(achter.aTop.x, achter.bTop.x), y: holeMidY },
      { x: Math.max(achter.aTop.x, achter.bTop.x), y: holeMidY },
      [
        frontRings.map((ring) => {
          const pairs = ring.map((p) => [p.x, p.y] as [number, number])
          const first = pairs[0]
          pairs.push([first[0], first[1]])
          return pairs
        }),
      ],
    )
    const probeCoversDoorMid = probe.some((piece) => {
      const minX = Math.min(piece[0].x, piece[1].x)
      const maxX = Math.max(piece[0].x, piece[1].x)
      return doorMidX >= minX - 1 && doorMidX <= maxX + 1
    })
    expect(probeCoversDoorMid).toBe(true)
  })

  it('kopse nok op voorste vlak verdwijnt niet achter de host', () => {
    const plan = createEmptyFloorPlan({ name: 'EndOn', wallHeightCm: 280 })
    plan.floors[0].walls = [wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })]
    const group = createFacadeGroup(plan, { name: 'VG', code: 'VG' })
    assignWallsToGroup(plan, group.id, ['front'])
    const ridge = markWallAsRidge(
      wall('ridge-end', { x: 200, y: 0 }, { x: 200, y: 200 }),
      ridgeEndpointExtras(280, 20, 350),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elev = projectFacadeElevation(plan, group.id)!
    const planes = groupElevationPaintPlanes(elev)
    expect(planes.some((p) => p.endOnRidges.some((r) => r.wallId === 'ridge-end'))).toBe(true)

    const linework = buildElevationLinework(elev)
    const ridgeStrokes = linework.strokes.filter((s) => s.role === 'ridge')
    expect(ridgeStrokes.length).toBeGreaterThan(0)
    const endOn = elev.walls.find((w) => w.wallId === 'ridge-end')!
    const corner = endOn.aTop
    const nearCorner = ridgeStrokes.some((stroke) =>
      stroke.points.some((p) => Math.hypot(p.x - corner.x, p.y - corner.y) < 3),
    )
    expect(nearCorner).toBe(true)
  })

  it('vloerband-outline bestaat; nok-band uit ridge-rect komt niet dubbel naast ridge-outline', () => {
    const plan = createEmptyFloorPlan({ name: 'Bands', wallHeightCm: 280 })
    plan.floors[0].walls = [wall('front', { x: 0, y: 0 }, { x: 400, y: 0 })]
    const group = createFacadeGroup(plan, { name: 'VG', code: 'VG' })
    assignWallsToGroup(plan, group.id, ['front'])

    const elevNoRidge = projectFacadeElevation(plan, group.id)!
    const lw0 = buildElevationLinework(elevNoRidge)
    expect(lw0.strokes.some((s) => s.role === 'slab')).toBe(true)

    const ridge = markWallAsRidge(
      wall('ridge', { x: 0, y: 0 }, { x: 400, y: 0 }),
      ridgeEndpointExtras(280, 20, 350),
    )
    plan.floors[0] = setRidgeWallsOnFloor(plan.floors[0], [ridge])
    const elev = projectFacadeElevation(plan, group.id)!
    expect(elev.walls.some((w) => w.ridge)).toBe(true)
    const lw = buildElevationLinework(elev)
    expect(lw.strokes.some((s) => s.role === 'ridge')).toBe(true)
    expect(lw.strokes.some((s) => s.role === 'slab')).toBe(true)
    // Nok-balk is de outline; geen extra AABB-band achter de balk.
    const nokBandCount = elev.bands.filter((b) => b.kind === 'nok').length
    expect(nokBandCount).toBe(0)
  })
})
