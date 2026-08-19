import { describe, expect, it } from 'vitest'
import type { FloorArea } from '@/core/fml/types'
import {
  AREA_SIDE_DIM_INSET_CM,
  AREA_SIDE_DIM_MIN_CM,
  buildAreaSideDims,
  mergeCollinearSides,
} from '@/ui/composables/fml-preview/fml-preview-area-side-dims'

function rect(x0: number, y0: number, w: number, h: number): FloorArea {
  return {
    id: `a-${x0}-${y0}`,
    poly: [
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
      { x: x0, y: y0 + h },
    ],
    color: '#ffffff',
    showAreaLabel: true,
  }
}

describe('AREA_SIDE_DIM_MIN_CM', () => {
  it('is 50 cm', () => {
    expect(AREA_SIDE_DIM_MIN_CM).toBe(50)
  })
})

describe('mergeCollinearSides', () => {
  it('houdt een rechthoek op 4 zijden', () => {
    const sides = mergeCollinearSides(rect(0, 0, 200, 120).poly)
    expect(sides).toHaveLength(4)
  })

  it('merge extra hoekpunten op één rechte zijde', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
      { x: 0, y: 150 },
    ]
    const sides = mergeCollinearSides(poly)
    expect(sides).toHaveLength(4)
    const top = sides.find((s) => Math.abs(s.a.y) < 1e-6 && Math.abs(s.b.y) < 1e-6)
    expect(top).toBeTruthy()
    expect(Math.hypot(top!.b.x - top!.a.x, top!.b.y - top!.a.y)).toBeCloseTo(200)
  })

  it('merge wrap-around als start midden op een zijde ligt', () => {
    const poly = [
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 120 },
      { x: 0, y: 120 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const sides = mergeCollinearSides(poly)
    expect(sides).toHaveLength(4)
    const top = sides.find((s) => Math.abs(s.a.y) < 1e-6 && Math.abs(s.b.y) < 1e-6)
    expect(Math.hypot(top!.b.x - top!.a.x, top!.b.y - top!.a.y)).toBeCloseTo(200)
  })

  it('merge twee faces met een klein dikte-trapje (jog)', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 154, y: 0 },
      { x: 154, y: 4 },
      { x: 326, y: 4 },
      { x: 326, y: 200 },
      { x: 0, y: 200 },
    ]
    const sides = mergeCollinearSides(poly)
    const top = sides.find((s) => Math.min(s.a.y, s.b.y) < 5 && Math.max(s.a.y, s.b.y) < 5)
    expect(top).toBeTruthy()
    expect(Math.hypot(top!.b.x - top!.a.x, top!.b.y - top!.a.y)).toBeCloseTo(326, 0)
  })

  it('merge T-inkeping tot één area-zijde (1.54 + 1.72 + muurdikte)', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 154, y: 0 },
      { x: 154, y: 15 },
      { x: 169, y: 15 },
      { x: 169, y: 0 },
      { x: 326, y: 0 },
      { x: 326, y: 250 },
      { x: 0, y: 250 },
    ]
    const sides = mergeCollinearSides(poly)
    const top = sides.find(
      (s) => Math.abs(s.a.y) < 1e-6 && Math.abs(s.b.y) < 1e-6 && Math.abs(s.a.x - s.b.x) > 200,
    )
    expect(top).toBeTruthy()
    expect(Math.hypot(top!.b.x - top!.a.x, top!.b.y - top!.a.y)).toBeCloseTo(326)
  })

  it('houdt L-vorm: parallelle zijden op andere offset blijven los', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 120 },
      { x: 140, y: 120 },
      { x: 140, y: 280 },
      { x: 0, y: 280 },
    ]
    const sides = mergeCollinearSides(poly)
    expect(sides).toHaveLength(6)
    const horizontals = sides.filter((s) => Math.abs(s.a.y - s.b.y) < 1)
    expect(horizontals).toHaveLength(3)
  })

  it('houdt U-vleugels los bij groot gat', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
      { x: 280, y: 40 },
      { x: 280, y: 0 },
      { x: 360, y: 0 },
      { x: 360, y: 200 },
      { x: 0, y: 200 },
    ]
    const sides = mergeCollinearSides(poly)
    const topPieces = sides.filter((s) => Math.abs(s.a.y) < 1e-6 && Math.abs(s.b.y) < 1e-6)
    expect(topPieces).toHaveLength(2)
  })
})

describe('buildAreaSideDims', () => {
  it('toont alle zijden ≥ 50 cm van een vierkant, label naar binnen', () => {
    const dims = buildAreaSideDims([rect(0, 0, 200, 200)])
    expect(dims).toHaveLength(4)
    expect(dims.every((d) => d.lengthCm >= 200 - 1e-6)).toBe(true)
    expect(dims.map((d) => d.label)).toEqual(['2.00 m', '2.00 m', '2.00 m', '2.00 m'])
    const top = dims.find((d) => Math.abs(d.a.y) < 1e-6 && Math.abs(d.b.y) < 1e-6)
    expect(top).toBeTruthy()
    expect(top!.mid.x).toBeCloseTo(100)
    expect(top!.mid.y).toBeCloseTo(AREA_SIDE_DIM_INSET_CM)
  })

  it('verbergt zijden onder 50 cm, houdt 50 cm', () => {
    const narrow = buildAreaSideDims([rect(0, 0, 200, 40)])
    expect(narrow).toHaveLength(2)
    expect(narrow.every((d) => d.lengthCm >= 200 - 1e-6)).toBe(true)

    const exact = buildAreaSideDims([rect(0, 0, 200, 50)])
    expect(exact).toHaveLength(4)
  })

  it('één maat op een area-zijde met clipper-kink (1.54 + 1.72)', () => {
    const kitchen: FloorArea = {
      id: 'keuken',
      poly: [
        { x: 0, y: 0 },
        { x: 154, y: 0 },
        { x: 154.3, y: 0.4 },
        { x: 326, y: 0 },
        { x: 326, y: 280 },
        { x: 0, y: 280 },
      ],
      color: '#fff',
      showAreaLabel: true,
    }
    const dims = buildAreaSideDims([kitchen])
    const top = dims.filter((d) => d.mid.y < 40)
    expect(top).toHaveLength(1)
    expect(top[0].lengthCm).toBeCloseTo(326, 0)
    expect(top[0].label).toBe('3.26 m')
  })

  it('één label op een gedeelde wand', () => {
    const a = rect(0, 0, 400, 300)
    const b = rect(0, -200, 400, 200)
    const dims = buildAreaSideDims([a, b])
    const shared = dims.filter(
      (d) => Math.abs(d.a.y) < 1 && Math.abs(d.b.y) < 1 && Math.abs(d.lengthCm - 400) < 1,
    )
    expect(shared).toHaveLength(1)
  })

  it('negeert te korte / ongeldige polygonen', () => {
    expect(buildAreaSideDims(undefined)).toEqual([])
    expect(
      buildAreaSideDims([
        { id: 'tiny', poly: rect(0, 0, 10, 10).poly, color: '#fff', showAreaLabel: true },
      ]),
    ).toEqual([])
  })
})
