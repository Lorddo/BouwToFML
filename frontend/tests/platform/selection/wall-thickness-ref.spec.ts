import { describe, expect, it } from 'vitest'
import {
  assignWallThicknessBand,
  enforceWallRefLimit,
  resolveReferenceWallThicknessPx,
  resolveWallThicknessBand,
  scaleMeasuredPxToMax,
  type WallRefThicknessMeasure,
} from '@/platform/selection/wall-thickness-ref'
import type { SelectionRect } from '@/platform/selection/types'
import {
  deriveFmlBandBoundariesCmFromRefPx,
  deriveFmlBandBoundariesFromWallRefMeasures,
} from '@/core/fml/fml-wall-thickness-tiers'
import { classifyWallThicknessBandPx } from '@/core/fml/wall-thickness-chain'

const LIMITS_7_30_47 = { minCm: 7, midCm: 30, maxCm: 47 }

function wallRect(id: string, band?: 'min' | 'mid' | 'max'): SelectionRect {
  return {
    id,
    type: 'wall',
    x: 0,
    y: 0,
    width: 40,
    height: 10,
    ...(band ? { wallThicknessBand: band } : {}),
  }
}

describe('scaleMeasuredPxToMax', () => {
  it('scales mid measurement to max equivalent', () => {
    expect(scaleMeasuredPxToMax(30, 30, 47)).toBeCloseTo(47, 5)
  })

  it('is identity when band is max', () => {
    expect(scaleMeasuredPxToMax(47, 47, 47)).toBe(47)
  })

  it('scales min measurement to max', () => {
    expect(scaleMeasuredPxToMax(7, 7, 47)).toBeCloseTo(47, 5)
  })
})

describe('resolveReferenceWallThicknessPx', () => {
  it('prefers higher scaled mid over under-measured max (hatched facade)', () => {
    const measures: WallRefThicknessMeasure[] = [
      { band: 'mid', thicknessPx: 30 },
      { band: 'max', thicknessPx: 26 },
    ]
    // mid 30 → scale 30*(47/30)=47 > max raw 26
    expect(resolveReferenceWallThicknessPx({ measures, limits: LIMITS_7_30_47 })).toBeCloseTo(47, 5)
  })

  it('uses max raw when it is the thickest equivalent', () => {
    const measures: WallRefThicknessMeasure[] = [
      { band: 'mid', thicknessPx: 30 },
      { band: 'max', thicknessPx: 50 },
    ]
    expect(resolveReferenceWallThicknessPx({ measures, limits: LIMITS_7_30_47 })).toBe(50)
  })

  it('scales only-mid to max', () => {
    const measures: WallRefThicknessMeasure[] = [{ band: 'mid', thicknessPx: 30 }]
    expect(resolveReferenceWallThicknessPx({ measures, limits: LIMITS_7_30_47 })).toBeCloseTo(47, 5)
  })

  it('scales only-min to max', () => {
    const measures: WallRefThicknessMeasure[] = [{ band: 'min', thicknessPx: 7 }]
    expect(resolveReferenceWallThicknessPx({ measures, limits: LIMITS_7_30_47 })).toBeCloseTo(47, 5)
  })

  it('returns null when no valid measures', () => {
    expect(resolveReferenceWallThicknessPx({ measures: [], limits: LIMITS_7_30_47 })).toBeNull()
  })
})

describe('enforceWallRefLimit', () => {
  it('allows up to 3 unique bands', () => {
    const { rects, removedIds } = enforceWallRefLimit([
      wallRect('a', 'max'),
      wallRect('b', 'mid'),
      wallRect('c', 'min'),
    ])
    expect(rects.filter((r) => r.type === 'wall')).toHaveLength(3)
    expect(removedIds).toEqual([])
  })

  it('keeps newest when same band repeats', () => {
    const { rects, removedIds } = enforceWallRefLimit([
      wallRect('old', 'max'),
      wallRect('new', 'max'),
    ])
    const walls = rects.filter((r) => r.type === 'wall')
    expect(walls).toHaveLength(1)
    expect(walls[0].id).toBe('new')
    expect(removedIds).toContain('old')
  })

  it('defaults missing band to max', () => {
    expect(resolveWallThicknessBand(wallRect('x'))).toBe('max')
  })
})

describe('assignWallThicknessBand', () => {
  it('swaps bands instead of deleting the other ref', () => {
    const next = assignWallThicknessBand([wallRect('a', 'max'), wallRect('b', 'mid')], 'b', 'max')
    const walls = next.filter((r) => r.type === 'wall')
    expect(walls).toHaveLength(2)
    expect(resolveWallThicknessBand(walls.find((w) => w.id === 'b')!)).toBe('max')
    expect(resolveWallThicknessBand(walls.find((w) => w.id === 'a')!)).toBe('mid')
  })

  it('assigns free band without touching others', () => {
    const next = assignWallThicknessBand([wallRect('a', 'max')], 'a', 'mid')
    expect(next).toHaveLength(1)
    expect(resolveWallThicknessBand(next[0])).toBe('mid')
  })
})

describe('deriveFmlBandBoundariesFromWallRefMeasures', () => {
  const pxPerMm = 1 // 1 px = 1 mm → 10 px = 1 cm

  it('falls back to 40/80 ratios for a single measure', () => {
    const maxEq = 470 // 47 cm at 1 px/mm
    const fromRatio = deriveFmlBandBoundariesCmFromRefPx(maxEq, pxPerMm, pxPerMm)
    const fromMeasures = deriveFmlBandBoundariesFromWallRefMeasures({
      measures: [{ band: 'max', thicknessPx: maxEq }],
      referenceWallThicknessPx: maxEq,
      pxPerMmX: pxPerMm,
      pxPerMmY: pxPerMm,
      limitsCm: LIMITS_7_30_47,
    })
    expect(fromMeasures).toEqual(fromRatio)
  })

  it('places boundaries between multi-ref measures (7/30/47)', () => {
    // px = cm * 10 at 1 px/mm
    const measures = [
      { band: 'min' as const, thicknessPx: 70 },
      { band: 'mid' as const, thicknessPx: 300 },
      { band: 'max' as const, thicknessPx: 470 },
    ]
    const bounds = deriveFmlBandBoundariesFromWallRefMeasures({
      measures,
      referenceWallThicknessPx: 470,
      pxPerMmX: pxPerMm,
      pxPerMmY: pxPerMm,
      limitsCm: LIMITS_7_30_47,
    })
    expect(bounds.midBoundaryCm).toBeCloseTo((7 + 30) / 2, 5)
    expect(bounds.maxBoundaryCm).toBeCloseTo((30 + 47) / 2, 5)
  })
})

describe('classifyWallThicknessBandPx with absolute boundaries', () => {
  const bounds = { midBoundaryPx: 185, maxBoundaryPx: 385 } // ~ halfway 7–30 and 30–47 at 10px/cm

  it('classifies 7/30/47-like thicknesses', () => {
    expect(classifyWallThicknessBandPx(70, 470, bounds)).toBe('min')
    expect(classifyWallThicknessBandPx(300, 470, bounds)).toBe('mid')
    expect(classifyWallThicknessBandPx(470, 470, bounds)).toBe('max')
  })

  it('falls back to ratios when absolute missing', () => {
    expect(classifyWallThicknessBandPx(100, 470)).toBe('min') // < 40%
    expect(classifyWallThicknessBandPx(250, 470)).toBe('mid')
    expect(classifyWallThicknessBandPx(400, 470)).toBe('max')
  })
})
