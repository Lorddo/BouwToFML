import { describe, expect, it } from 'vitest'
import {
  buildOpeningEndCaps,
  buildOpeningFaceSills,
  buildWindowPlanSymbol,
  type PlanPolylineGlyph,
} from '@/core/plan/opening-plan-symbol'

function polylines(glyphs: { kind: string; role: string }[], role: string): PlanPolylineGlyph[] {
  return glyphs.filter((g): g is PlanPolylineGlyph => g.kind === 'polyline' && g.role === role)
}

describe('buildOpeningFaceSills', () => {
  it('tekent twee faces op ±halve dikte, solid tenzij dashed', () => {
    const solid = buildOpeningFaceSills({
      start: { x: 0, y: 0 },
      end: { x: 120, y: 0 },
      wallUnit: { x: 1, y: 0 },
      wallThickness: 20,
    })
    expect(solid).toHaveLength(2)
    expect(solid.every((g) => g.kind === 'polyline' && !g.dashed)).toBe(true)
    const ys = solid.map((g) => (g.kind === 'polyline' ? g.points[1] : 0)).sort((a, b) => a - b)
    expect(ys).toEqual([-10, 10])

    const dashed = buildOpeningFaceSills({
      start: { x: 0, y: 0 },
      end: { x: 80, y: 0 },
      wallUnit: { x: 1, y: 0 },
      wallThickness: 10,
      dashed: true,
    })
    expect(dashed.every((g) => g.kind === 'polyline' && g.dashed)).toBe(true)
  })
})

describe('buildOpeningEndCaps', () => {
  it('tekent twee dwarslijnen op start/eind over de volle dikte', () => {
    const caps = buildOpeningEndCaps({
      start: { x: 40, y: 0 },
      end: { x: 160, y: 0 },
      wallUnit: { x: 1, y: 0 },
      wallThickness: 20,
    })
    expect(caps).toHaveLength(2)
    expect(caps.every((g) => g.kind === 'polyline' && !g.dashed)).toBe(true)
    const xs = caps.map((g) => (g.kind === 'polyline' ? g.points[0] : 0)).sort((a, b) => a - b)
    expect(xs).toEqual([40, 160])
    for (const cap of caps) {
      if (cap.kind !== 'polyline') continue
      const ys = [cap.points[1], cap.points[3]].sort((a, b) => a - b)
      expect(ys).toEqual([-10, 10])
    }
  })
})

describe('buildWindowPlanSymbol', () => {
  it('heeft twee solid sills over de volle opening', () => {
    const symbol = buildWindowPlanSymbol({
      start: { x: 10, y: 0 },
      end: { x: 130, y: 0 },
      wallUnit: { x: 1, y: 0 },
      thicknessCm: 16,
      panelCount: 1,
    })
    const sills = polylines(symbol.glyphs, 'sill')
    expect(sills).toHaveLength(2)
    expect(sills.every((s) => !s.dashed)).toBe(true)
    for (const sill of sills) {
      expect(sill.points[0]).toBeCloseTo(10, 5)
      expect(sill.points[2]).toBeCloseTo(130, 5)
    }
  })
})
