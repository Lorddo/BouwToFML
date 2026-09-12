import { describe, expect, it } from 'vitest'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import {
  CLEAR_HEIGHT_150_CM,
  clearHeightSnedeZCm,
  computeClearHeightContour,
} from '@/core/fml/roof-clear-height'
import { makeRoofSurface, setRidgeSurfacesOnFloor } from '@/core/fml/roof-planes'
import { dakThicknessCmForPlan } from '@/core/fml/ridge-walls'
import { setNokThicknessCm } from '@/core/fml/floor-stack'
import type { FloorArea, FloorPlan, Wall } from '@/core/fml/types'
import { makeEndpoint3D } from '@/core/fml/wall-endpoint-height'

/**
 * Twee kamers naast elkaar onder één schilddak (goot Y=0 Z=100, nok Y=600 Z=400).
 * Rechter kamer lining 10 cm → snede/fill alleen daar opschuiven.
 */
function wall(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Wall {
  const end = makeEndpoint3D(0, 280)
  return {
    id,
    a,
    b,
    thickness: 20,
    openings: [],
    elevation: { a: end, b: { ...end } },
  }
}

function twoRoomPlan(): FloorPlan {
  let plan = createEmptyFloorPlan({ name: 'lining-split', wallHeightCm: 280 })
  plan.floors[0]!.walls = [
    wall('w-s', { x: 0, y: 0 }, { x: 800, y: 0 }),
    wall('w-e', { x: 800, y: 0 }, { x: 800, y: 600 }),
    wall('w-n', { x: 800, y: 600 }, { x: 0, y: 600 }),
    wall('w-w', { x: 0, y: 600 }, { x: 0, y: 0 }),
    wall('w-m', { x: 400, y: 0 }, { x: 400, y: 600 }),
  ]
  plan = setNokThicknessCm(plan, 20)
  const roof = makeRoofSurface({
    id: 'roof-main',
    origin: 'manual',
    poly: [
      { x: 0, y: 0, z: 100 },
      { x: 800, y: 0, z: 100 },
      { x: 800, y: 600, z: 400 },
      { x: 0, y: 600, z: 400 },
    ],
  })
  plan = {
    ...plan,
    floors: plan.floors.map((floor, index) =>
      index === 0 ? setRidgeSurfacesOnFloor(floor, [roof]) : floor,
    ),
  }
  const left: FloorArea = {
    id: 'left',
    poly: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 600 },
      { x: 0, y: 600 },
    ],
    color: '#eee',
    showAreaLabel: true,
  }
  const right: FloorArea = {
    id: 'right',
    poly: [
      { x: 400, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 600 },
      { x: 400, y: 600 },
    ],
    color: '#ddd',
    showAreaLabel: true,
    liningCm: 10,
  }
  plan.floors[0]!.areas = [left, right]
  return plan
}

function meanY(points: { x: number; y: number }[]): number {
  return points.reduce((s, p) => s + p.y, 0) / Math.max(1, points.length)
}

function maxX(points: { x: number; y: number }[]): number {
  return Math.max(...points.map((p) => p.x))
}

function minX(points: { x: number; y: number }[]): number {
  return Math.min(...points.map((p) => p.x))
}

describe('clear-height lining per ruimte', () => {
  it('rechter lining verschuift alleen de rechter snede/fill', () => {
    const plan = twoRoomPlan()
    const dakThicknessCm = dakThicknessCmForPlan(plan)
    expect(dakThicknessCm).toBe(20)
    const zLeft = clearHeightSnedeZCm({ heightCm: CLEAR_HEIGHT_150_CM, liningCm: 0 })
    const zRight = clearHeightSnedeZCm({
      heightCm: CLEAR_HEIGHT_150_CM,
      liningCm: 10,
    })
    // Schild: Z = 100 + y * 0.5 → y = (Z - 100) / 0.5
    const yLeftExpected = (zLeft - 100) / 0.5
    const yRightExpected = (zRight - 100) / 0.5
    expect(yRightExpected).toBeGreaterThan(yLeftExpected)

    const contour = computeClearHeightContour(plan, 0, CLEAR_HEIGHT_150_CM)
    expect(contour.polylines.length).toBeGreaterThanOrEqual(2)

    const leftLines = contour.polylines.filter((line) => maxX(line.points) <= 410)
    const rightLines = contour.polylines.filter((line) => minX(line.points) >= 390)
    expect(leftLines.length).toBeGreaterThan(0)
    expect(rightLines.length).toBeGreaterThan(0)

    const leftY = meanY(leftLines.flatMap((l) => l.points))
    const rightY = meanY(rightLines.flatMap((l) => l.points))
    expect(Math.abs(leftY - yLeftExpected)).toBeLessThan(8)
    expect(Math.abs(rightY - yRightExpected)).toBeLessThan(8)
    expect(rightY - leftY).toBeGreaterThan(10)

    // Fill: stuk in linkerhelft mag niet de rechter snede-Y overschrijden (geen lekkage).
    const leftFills = contour.rings.filter((ring) => maxX(ring.points) <= 410)
    const rightFills = contour.rings.filter((ring) => minX(ring.points) >= 390)
    expect(leftFills.length).toBeGreaterThan(0)
    expect(rightFills.length).toBeGreaterThan(0)
    const leftFillMaxY = Math.max(...leftFills.flatMap((r) => r.points.map((p) => p.y)))
    expect(leftFillMaxY).toBeLessThan(yRightExpected - 5)
  })
})
