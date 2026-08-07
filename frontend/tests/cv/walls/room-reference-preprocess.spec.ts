import { describe, expect, it } from 'vitest'
import {
  resolveReferenceBridgeGapsPx,
  resolveReferencePrefilterThickenPx,
  resolveReferenceRemoveHolesPx,
} from '@/cv/walls/rooms/room-reference-preprocess'

describe('resolveReferenceRemoveHolesPx', () => {
  it('gebruikt legacy fallback zonder referentiedikte', () => {
    expect(resolveReferenceRemoveHolesPx()).toBe(15)
  })

  it('schaalt gatenvulling voor solid walls', () => {
    expect(resolveReferenceRemoveHolesPx(30, 'solid')).toBe(16)
  })

  it('schaalt voor open walls conservatiever', () => {
    expect(resolveReferenceRemoveHolesPx(30, 'open')).toBe(16)
  })

  it('clamped binnen stijl-afhankelijke range', () => {
    expect(resolveReferenceRemoveHolesPx(4, 'solid')).toBe(16)
    expect(resolveReferenceRemoveHolesPx(400, 'solid')).toBe(44)
    expect(resolveReferenceRemoveHolesPx(4, 'open')).toBe(16)
    expect(resolveReferenceRemoveHolesPx(400, 'open')).toBe(42)
  })
})

describe('resolveReferencePrefilterThickenPx', () => {
  it('gebruikt fallback zonder referentiedikte', () => {
    expect(resolveReferencePrefilterThickenPx()).toBe(2)
  })

  it('solid: 0.15×REF zonder cap', () => {
    expect(resolveReferencePrefilterThickenPx(73, 'solid')).toBe(11)
    expect(resolveReferencePrefilterThickenPx(200, 'solid')).toBe(30)
  })

  it('open: 0.25×REF zonder cap', () => {
    expect(resolveReferencePrefilterThickenPx(73, 'open')).toBe(18)
    expect(resolveReferencePrefilterThickenPx(200, 'open')).toBe(50)
  })
})

describe('resolveReferenceBridgeGapsPx', () => {
  it('gebruikt fallback zonder referentiedikte', () => {
    expect(resolveReferenceBridgeGapsPx()).toBe(8)
  })

  it('solid: 0.2×REF zonder cap', () => {
    expect(resolveReferenceBridgeGapsPx(73, 'solid')).toBe(15)
    expect(resolveReferenceBridgeGapsPx(200, 'solid')).toBe(40)
  })

  it('open: 0.3×REF zonder cap', () => {
    expect(resolveReferenceBridgeGapsPx(73, 'open')).toBe(22)
    expect(resolveReferenceBridgeGapsPx(200, 'open')).toBe(60)
  })
})
