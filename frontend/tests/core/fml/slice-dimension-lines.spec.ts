import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import {
  dimensionLiesOnSlice,
  filterManualDimensions,
  readBtfSlices,
  writeBtfSlices,
  type BtfSlice,
} from '@/core/fml/btf-slices'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { writeDimensionSettings } from '@/core/fml/fml-dimension-settings'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { buildSliceDimensionLines, buildSliceGuide } from '@/core/fml/slice-dimension-lines'
import type { FloorDimension, Wall } from '@/core/fml/types'

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }, t = 20): Wall {
  return { id, a, b, thickness: t, balance: 0.5, openings: [] }
}

/** Rechthoek 400×300 hartlijn, dikte 20 → binnenfaces ~10..390 / 10..290. */
function rectangleWalls(): Wall[] {
  return [
    wall('n', { x: 0, y: 0 }, { x: 400, y: 0 }),
    wall('s', { x: 0, y: 300 }, { x: 400, y: 300 }),
    wall('w', { x: 0, y: 0 }, { x: 0, y: 300 }),
    wall('e', { x: 400, y: 0 }, { x: 400, y: 300 }),
  ]
}

describe('btf-slices + slice-dimension-lines', () => {
  it('H-slice (M/P horizontaal offset): meet verticaal, plaats op P', () => {
    const walls = rectangleWalls()
    // M in kamer, P links buiten → offset west → meetas verticaal
    const slice: BtfSlice = { m: { x: 200, y: 150 }, p: { x: -50, y: 150 } }
    const guide = buildSliceGuide(slice, walls)
    expect(guide).not.toBeNull()
    expect(Math.abs(guide!.measureA.x - guide!.measureB.x)).toBeLessThan(0.5)
    expect(Math.abs(guide!.placeA.x - -50)).toBeLessThan(0.5)

    const interior = buildSliceDimensionLines(slice, walls, 'interior')
    expect(interior.length).toBeGreaterThan(0)
    const total = interior.reduce(
      (sum, line) => sum + Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y),
      0,
    )
    // Binnenhoogte ~280 cm (300 − 2×10)
    expect(total).toBeGreaterThan(270)
    expect(total).toBeLessThan(290)
    for (const line of interior) {
      expect(Math.abs(line.a.x - -50)).toBeLessThan(0.5)
      expect(Math.abs(line.b.x - -50)).toBeLessThan(0.5)
    }
  })

  it('schuine M→P: meetas loodrecht op offset', () => {
    const walls = rectangleWalls()
    const slice: BtfSlice = { m: { x: 200, y: 150 }, p: { x: 250, y: 200 } }
    const guide = buildSliceGuide(slice, walls)
    expect(guide).not.toBeNull()
    const mdx = guide!.measureB.x - guide!.measureA.x
    const mdy = guide!.measureB.y - guide!.measureA.y
    const odx = slice.p.x - slice.m.x
    const ody = slice.p.y - slice.m.y
    // meetas · offset ≈ 0
    expect(
      Math.abs(mdx * odx + mdy * ody) / (Math.hypot(mdx, mdy) * Math.hypot(odx, ody)),
    ).toBeLessThan(0.02)
  })

  it('interior slaat muurdikte over; exterior houdt die', () => {
    // Twee kamers gescheiden door verticale binnenmuur dikte 20 op x=200
    const walls = [
      wall('n', { x: 0, y: 0 }, { x: 400, y: 0 }),
      wall('s', { x: 0, y: 300 }, { x: 400, y: 300 }),
      wall('w', { x: 0, y: 0 }, { x: 0, y: 300 }),
      wall('e', { x: 400, y: 0 }, { x: 400, y: 300 }),
      wall('mid', { x: 200, y: 0 }, { x: 200, y: 300 }, 20),
    ]
    const slice: BtfSlice = { m: { x: 100, y: 150 }, p: { x: 100, y: -40 } }
    const interior = buildSliceDimensionLines(slice, walls, 'interior')
    const exterior = buildSliceDimensionLines(slice, walls, 'exterior')
    const intLens = interior.map((l) => Math.round(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y)))
    const extLens = exterior.map((l) => Math.round(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y)))
    expect(intLens.some((n) => n >= 18 && n <= 22)).toBe(false)
    expect(extLens.some((n) => n >= 18 && n <= 22)).toBe(true)
  })

  it('extras roundtrip {m,p}; dim op P-lijn koppelt, ernaast blijft manual', () => {
    let plan = createEmptyFloorPlan({ name: 'Slice' })
    plan.floors[0].walls = rectangleWalls()
    // P links (plaats), M in kamer (meet) — offset horizontaal → meetas verticaal
    const slice: BtfSlice = { m: { x: 200, y: 150 }, p: { x: -50, y: 150 } }
    plan = writeBtfSlices(plan, [slice], 0)
    expect(readBtfSlices(plan.floors[0])).toEqual([slice])

    const baked: FloorDimension = {
      id: 'bake-1',
      type: 'custom_dimension',
      a: { x: -50, y: 10 },
      b: { x: -50, y: 290 },
    }
    const manual: FloorDimension = {
      id: 'man-1',
      type: 'custom_dimension',
      a: { x: 0, y: -80 },
      b: { x: 400, y: -80 },
    }
    expect(dimensionLiesOnSlice(baked, slice)).toBe(true)
    expect(dimensionLiesOnSlice(manual, slice)).toBe(false)
    expect(filterManualDimensions([baked, manual], [slice]).map((d) => d.id)).toEqual(['man-1'])

    plan.floors[0].dimensions = [baked, manual]
    plan = writeDimensionSettings(plan, { dimensionMode: 'interior' })
    // Sync design dimensions for export
    plan = writeBtfSlices(plan, [slice], 0)
    plan.floors[0] = {
      ...plan.floors[0],
      dimensions: [baked, manual],
      designs: plan.floors[0].designs?.map((d, i) =>
        i === 0 ? { ...d, dimensions: [baked, manual], walls: plan.floors[0].walls } : d,
      ),
    }

    const raw = JSON.parse(buildFmlV3(plan))
    expect(raw.floors[0].designs[0].settings.btfSlices).toEqual([slice])
    const exportedDims = raw.floors[0].designs[0].dimensions as Array<{
      a: { x: number; y: number }
      b: { x: number; y: number }
    }>
    expect(exportedDims.some((d) => Math.abs(d.a.y + 80) < 1 && Math.abs(d.b.y + 80) < 1)).toBe(
      true,
    )
    // Bake opnieuw: er moet minstens één dim op x=-50 staan
    expect(exportedDims.some((d) => Math.abs(d.a.x + 50) < 1 && Math.abs(d.b.x + 50) < 1)).toBe(
      true,
    )

    const { plan: imported } = importFmlV3(raw)
    expect(readBtfSlices(imported.floors[0])).toEqual([slice])
    // Bake gestript; manual blijft (ids worden bij import opnieuw gegenereerd)
    const dims = imported.floors[0].dimensions ?? []
    expect(dims.some((d) => Math.abs(d.a.y + 80) < 1 && Math.abs(d.b.y + 80) < 1)).toBe(true)
    expect(dims.every((d) => !(Math.abs(d.a.x + 50) < 1 && Math.abs(d.b.x + 50) < 1))).toBe(true)
  })
})
