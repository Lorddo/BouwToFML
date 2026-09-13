import { describe, expect, it } from 'vitest'
import {
  isAxisLock,
  isSettingsMod,
  resolveRelocatePointerIntent,
  resolveWallPointerIntent,
  wantsClickMove,
  wantsRelocate,
} from '@/ui/composables/plan-canvas/plan-canvas-mods'

describe('plan-canvas-mods', () => {
  it('settings toggle works without ctrlKey', () => {
    expect(isSettingsMod({}, true)).toBe(true)
    expect(isSettingsMod({ ctrlKey: false }, false)).toBe(false)
    expect(isSettingsMod({ ctrlKey: true }, false)).toBe(true)
    expect(isSettingsMod({ metaKey: true }, false)).toBe(true)
  })

  it('axis lock toggle works without shiftKey', () => {
    expect(isAxisLock({}, true)).toBe(true)
    expect(isAxisLock({ shiftKey: false }, false)).toBe(false)
    expect(isAxisLock({ shiftKey: true }, false)).toBe(true)
  })

  it('requires Move only on the touch rail', () => {
    expect(wantsRelocate(false, false)).toBe(true)
    expect(wantsRelocate(false, true)).toBe(true)
    expect(wantsRelocate(true, false)).toBe(false)
    expect(wantsRelocate(true, true)).toBe(true)
  })

  it('start click-move met Shift op desktop en Move op touch', () => {
    expect(wantsClickMove({ touchNav: false, moveMod: false, shiftKey: true })).toBe(true)
    expect(wantsClickMove({ touchNav: false, moveMod: false, shiftKey: false })).toBe(false)
    expect(wantsClickMove({ touchNav: true, moveMod: false, shiftKey: true })).toBe(false)
    expect(wantsClickMove({ touchNav: true, moveMod: true, shiftKey: false })).toBe(true)
  })

  it('desktop click-drag of Shift-precise; touch alleen Precise via Move', () => {
    expect(resolveRelocatePointerIntent({ touchNav: false, moveMod: false, shiftKey: false })).toBe(
      'drag',
    )
    expect(resolveRelocatePointerIntent({ touchNav: false, moveMod: false, shiftKey: true })).toBe(
      'precise',
    )
    expect(resolveRelocatePointerIntent({ touchNav: true, moveMod: false, shiftKey: false })).toBe(
      'select',
    )
    expect(resolveRelocatePointerIntent({ touchNav: true, moveMod: true, shiftKey: false })).toBe(
      'precise',
    )
  })

  it('resolveWallPointerIntent blijft alias van resolveRelocatePointerIntent', () => {
    expect(resolveWallPointerIntent({ touchNav: false, moveMod: false, shiftKey: true })).toBe(
      'precise',
    )
  })
})
