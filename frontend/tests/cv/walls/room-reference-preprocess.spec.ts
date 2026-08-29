import { describe, expect, it } from 'vitest'
import {
  describeRoomReferenceTune,
  resolveReferenceBridgeGapsPx,
  resolveReferencePrefilterThickenPx,
  resolveReferenceRemoveHolesPx,
} from '@/cv/walls/rooms/room-reference-preprocess'

describe('resolveReferenceRemoveHolesPx', () => {
  it('gebruikt legacy fallback zonder referentiedikte', () => {
    expect(resolveReferenceRemoveHolesPx()).toBe(15)
  })

  it('solid: 0.2×REF zonder cap', () => {
    expect(resolveReferenceRemoveHolesPx(30, 'solid')).toBe(6)
    expect(resolveReferenceRemoveHolesPx(400, 'solid')).toBe(80)
  })

  it('open: 0.3×REF zonder cap', () => {
    expect(resolveReferenceRemoveHolesPx(30, 'open')).toBe(9)
    expect(resolveReferenceRemoveHolesPx(400, 'open')).toBe(120)
  })
})

describe('resolveReferencePrefilterThickenPx', () => {
  it('gebruikt fallback zonder referentiedikte', () => {
    expect(resolveReferencePrefilterThickenPx()).toBe(2)
  })

  it('solid en open: 0.1×REF zonder cap', () => {
    expect(resolveReferencePrefilterThickenPx(73, 'solid')).toBe(7)
    expect(resolveReferencePrefilterThickenPx(200, 'solid')).toBe(20)
    expect(resolveReferencePrefilterThickenPx(73, 'open')).toBe(7)
    expect(resolveReferencePrefilterThickenPx(200, 'open')).toBe(20)
  })
})

describe('resolveReferenceBridgeGapsPx', () => {
  it('gebruikt fallback zonder referentiedikte', () => {
    expect(resolveReferenceBridgeGapsPx()).toBe(8)
  })

  it('solid: 0.15×REF zonder cap', () => {
    expect(resolveReferenceBridgeGapsPx(73, 'solid')).toBe(11)
    expect(resolveReferenceBridgeGapsPx(200, 'solid')).toBe(30)
  })

  it('open: 0.2×REF zonder cap', () => {
    expect(resolveReferenceBridgeGapsPx(73, 'open')).toBe(15)
    expect(resolveReferenceBridgeGapsPx(200, 'open')).toBe(40)
  })
})

describe('describeRoomReferenceTune', () => {
  it('toont open-factoren op REF', () => {
    const tune = describeRoomReferenceTune({
      referenceWallThicknessPx: 40,
      wallStyle: 'open',
    })
    expect(tune).toMatchObject({
      style: 'open',
      hasRef: true,
      refPx: 40,
      brightness: 50,
      contrast: 1,
      thickenPx: 4,
      thickenFactor: 0.1,
      bridgePx: 8,
      bridgeFactor: 0.2,
      holeFillPx: 12,
      holeFillFactor: 0.3,
    })
  })

  it('toont solid-factoren op REF', () => {
    const tune = describeRoomReferenceTune({
      referenceWallThicknessPx: 40,
      wallStyle: 'solid',
    })
    expect(tune.thickenPx).toBe(4)
    expect(tune.bridgePx).toBe(6)
    expect(tune.holeFillPx).toBe(8)
    expect(tune.bridgeFactor).toBe(0.15)
    expect(tune.holeFillFactor).toBe(0.2)
  })
})
