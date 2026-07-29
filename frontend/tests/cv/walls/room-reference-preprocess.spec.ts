import { describe, expect, it } from 'vitest'
import { resolveReferenceRemoveHolesPx } from '@/cv/walls/rooms/room-reference-preprocess'

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
