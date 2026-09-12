import { describe, expect, it } from 'vitest'
import {
  collectOverlayDimensionLines,
  convertOverlayDimensionsToManual,
} from '@/core/fml/convert-overlay-dimensions'
import { createEmptyFloorPlan } from '@/core/fml/empty-floor-plan'
import { writeDimensionSettings } from '@/core/fml/fml-dimension-settings'
import { readPlanSlices, writePlanSlices } from '@/core/fml/plan-slices'
import type { FloorArea, Wall } from '@/core/fml/types'

function wall(id: string, ax: number, ay: number, bx: number, by: number): Wall {
  return { id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: 20, balance: 0.5, openings: [] }
}

function rectanglePlan() {
  const plan = createEmptyFloorPlan({ name: 'Dims' })
  const walls = [
    wall('n', 0, 0, 400, 0),
    wall('s', 0, 300, 400, 300),
    wall('w', 0, 0, 0, 300),
    wall('e', 400, 0, 400, 300),
  ]
  const areas: FloorArea[] = [
    {
      id: 'room',
      poly: [
        { x: 10, y: 10 },
        { x: 390, y: 10 },
        { x: 390, y: 290 },
        { x: 10, y: 290 },
      ],
      color: '#ccc',
      showAreaLabel: true,
    },
  ]
  plan.floors[0] = { ...plan.floors[0], walls, areas }
  return plan
}

describe('convertOverlayDimensionsToManual', () => {
  it('autogen: baket lijnen, zet flag uit, bestaande manual blijft', () => {
    let plan = rectanglePlan()
    plan = writeDimensionSettings(plan, { engineAutoDims: true, dimensionMode: 'interior' }, 0)
    plan.floors[0].dimensions = [
      { id: 'keep', type: 'custom_dimension', a: { x: 0, y: -80 }, b: { x: 100, y: -80 } },
    ]
    const overlay = collectOverlayDimensionLines(plan, 0, 'autogen')
    expect(overlay.length).toBeGreaterThan(0)

    const next = convertOverlayDimensionsToManual(plan, 0, 'autogen')
    expect(next.source?.settings).toBeTruthy()
    const settings = next.floors[0].designs?.[0]?.source?.settings
    expect(settings?.engineAutoDims).not.toBe(true)
    const ids = (next.floors[0].dimensions ?? []).map((d) => d.id)
    expect(ids).toContain('keep')
    expect(ids.length).toBe(1 + overlay.length)
  })

  it('slicer: baket P-lijn maten en wist slices', () => {
    let plan = rectanglePlan()
    plan = writePlanSlices(plan, [{ m: { x: 200, y: 150 }, p: { x: -50, y: 150 } }], 0)
    expect(readPlanSlices(plan.floors[0]).length).toBe(1)
    const overlay = collectOverlayDimensionLines(plan, 0, 'slicer')
    expect(overlay.length).toBeGreaterThan(0)

    const next = convertOverlayDimensionsToManual(plan, 0, 'slicer')
    expect(readPlanSlices(next.floors[0])).toEqual([])
    expect((next.floors[0].dimensions ?? []).length).toBe(overlay.length)
    for (const dim of next.floors[0].dimensions ?? []) {
      expect(Math.abs(dim.a.x + 50)).toBeLessThan(0.5)
      expect(Math.abs(dim.b.x + 50)).toBeLessThan(0.5)
    }
  })

  it('geen overlay → plan ongewijzigd qua lijnen (autogen uit)', () => {
    const plan = rectanglePlan()
    const next = convertOverlayDimensionsToManual(plan, 0, 'autogen')
    expect(next.floors[0].dimensions).toBeUndefined()
  })
})
