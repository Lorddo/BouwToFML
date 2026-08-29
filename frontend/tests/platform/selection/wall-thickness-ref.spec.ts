import { describe, expect, it } from 'vitest'
import {
  bindNextWallRefCm,
  findWallRectForCm,
  enforceWallRefLimit,
  resolveReferenceWallThicknessPx,
  scaleMeasuredPxToMax,
  type WallRefThicknessMeasure,
} from '@/platform/selection/wall-thickness-ref'
import type { SelectionRect } from '@/platform/selection/types'
import { classifyWallThicknessBandPx } from '@/core/fml/wall-thickness-chain'

const CATALOG_7_30_47 = [7, 30, 47]

function wallRect(id: string, cm?: number): SelectionRect {
  return {
    id,
    type: 'wall',
    x: 0,
    y: 0,
    width: 40,
    height: 10,
    ...(cm != null ? { wallThicknessCm: cm } : {}),
  }
}

describe('scaleMeasuredPxToMax', () => {
  it('20 px @ 20 cm, max 30 → 30 px', () => {
    expect(scaleMeasuredPxToMax(20, 20, 30)).toBe(30)
  })

  it('is identity when refCm === maxCm', () => {
    expect(scaleMeasuredPxToMax(47, 47, 47)).toBe(47)
  })

  it('scales mid measurement to max equivalent', () => {
    expect(scaleMeasuredPxToMax(30, 30, 47)).toBeCloseTo(47, 5)
  })
})

describe('resolveReferenceWallThicknessPx', () => {
  it('prefers higher scaled mid over under-measured max', () => {
    const measures: WallRefThicknessMeasure[] = [
      { thicknessCm: 30, thicknessPx: 30 },
      { thicknessCm: 47, thicknessPx: 26 },
    ]
    expect(resolveReferenceWallThicknessPx({ measures, catalogCms: CATALOG_7_30_47 })).toBeCloseTo(
      47,
      5,
    )
  })

  it('uses max raw when it is the thickest equivalent', () => {
    const measures: WallRefThicknessMeasure[] = [
      { thicknessCm: 30, thicknessPx: 30 },
      { thicknessCm: 47, thicknessPx: 50 },
    ]
    expect(resolveReferenceWallThicknessPx({ measures, catalogCms: CATALOG_7_30_47 })).toBe(50)
  })

  it('scales only-mid to max', () => {
    const measures: WallRefThicknessMeasure[] = [{ thicknessCm: 30, thicknessPx: 30 }]
    expect(resolveReferenceWallThicknessPx({ measures, catalogCms: CATALOG_7_30_47 })).toBeCloseTo(
      47,
      5,
    )
  })

  it('returns null when no valid measures', () => {
    expect(
      resolveReferenceWallThicknessPx({ measures: [], catalogCms: CATALOG_7_30_47 }),
    ).toBeNull()
  })
})

describe('enforceWallRefLimit', () => {
  it('houdt 4 refs', () => {
    const { rects, removedIds } = enforceWallRefLimit([
      wallRect('a', 30),
      wallRect('b', 20),
      wallRect('c', 15),
      wallRect('d', 10),
    ])
    expect(rects.filter((r) => r.type === 'wall')).toHaveLength(4)
    expect(removedIds).toEqual([])
  })

  it('9e valt af (oudste eerst)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    const { rects, removedIds } = enforceWallRefLimit(ids.map((id) => wallRect(id, 20)))
    const walls = rects.filter((r) => r.type === 'wall')
    expect(walls).toHaveLength(8)
    expect(walls.map((w) => w.id)).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
    expect(removedIds).toEqual(['a'])
  })
})

describe('findWallRectForCm', () => {
  it('vindt de muur-ref met die catalogus-cm', () => {
    expect(findWallRectForCm([wallRect('a', 30), wallRect('b', 20)], 20)?.id).toBe('b')
    expect(findWallRectForCm([wallRect('a', 30)], 10)).toBeNull()
  })
})

describe('bindNextWallRefCm', () => {
  it('eerste nieuwe muur-ref = grootste catalogus-cm', () => {
    expect(bindNextWallRefCm([], [10, 20, 30])).toBe(30)
  })

  it('volgende = dikste ongebruikte', () => {
    expect(bindNextWallRefCm([wallRect('a', 30)], [10, 20, 30])).toBe(20)
    expect(bindNextWallRefCm([wallRect('a', 30), wallRect('b', 20)], [10, 20, 30])).toBe(10)
  })
})

describe('classifyWallThicknessBandPx with absolute boundaries', () => {
  const bounds = { midBoundaryPx: 185, maxBoundaryPx: 385 }

  it('classifies 7/30/47-like thicknesses', () => {
    expect(classifyWallThicknessBandPx(70, 470, bounds)).toBe('min')
    expect(classifyWallThicknessBandPx(300, 470, bounds)).toBe('mid')
    expect(classifyWallThicknessBandPx(470, 470, bounds)).toBe('max')
  })

  it('falls back to ratios when absolute missing', () => {
    expect(classifyWallThicknessBandPx(100, 470)).toBe('min')
    expect(classifyWallThicknessBandPx(250, 470)).toBe('mid')
    expect(classifyWallThicknessBandPx(400, 470)).toBe('max')
  })
})
