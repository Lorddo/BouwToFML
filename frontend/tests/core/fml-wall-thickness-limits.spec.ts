import { describe, expect, it } from 'vitest'
import {
  clampWallThicknessCm,
  resolveEffectiveFmlWallThicknessLimits,
} from '@/core/fml/fml-wall-thickness-limits'

describe('fml-wall-thickness-limits', () => {
  it('clamped dikte blijft binnen min en max', () => {
    const limits = { minCm: 10, midCm: 20, maxCm: 30 }
    expect(clampWallThicknessCm(5, limits)).toBe(10)
    expect(clampWallThicknessCm(20, limits)).toBe(20)
    expect(clampWallThicknessCm(40, limits)).toBe(30)
  })

  it('normaliseert omgekeerde min/mid/max', () => {
    const effective = resolveEffectiveFmlWallThicknessLimits({ minCm: 30, midCm: 10, maxCm: 17 })
    expect(effective).toEqual({ minCm: 10, midCm: 17, maxCm: 30 })
    expect(clampWallThicknessCm(5, { minCm: 30, midCm: 10, maxCm: 17 })).toBe(10)
    expect(clampWallThicknessCm(40, { minCm: 30, midCm: 10, maxCm: 17 })).toBe(30)
  })

  it('clamped diktes komen overeen met vroegere plan-limits helper', () => {
    const limits = { minCm: 10, midCm: 17, maxCm: 30 }
    expect([5, 18, 42].map((t) => clampWallThicknessCm(t, limits))).toEqual([10, 18, 30])
  })
})
