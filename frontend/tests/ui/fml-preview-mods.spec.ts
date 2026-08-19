import { describe, expect, it } from 'vitest'
import {
  isAxisLock,
  isSettingsMod,
  wantsRelocate,
} from '@/ui/composables/fml-preview/fml-preview-mods'

describe('fml-preview-mods', () => {
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
})
