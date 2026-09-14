import { describe, expect, it } from 'vitest'
import {
  createFactoryUserSettings,
  normalizeUserSettings,
  parseUserSettingsJson,
} from '@/ui/composables/settings/user-settings'

describe('user settings openingMerge', () => {
  it('factory defaults merge toggles on', () => {
    const factory = createFactoryUserSettings()
    expect(factory.openingMerge.mergeDoubleDoors).toBe(true)
    expect(factory.openingMerge.mergeMultiWindows).toBe(true)
  })

  it('missing openingMerge → factory true (forward-compatible)', () => {
    const normalized = normalizeUserSettings({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    expect(normalized.openingMerge.mergeDoubleDoors).toBe(true)
    expect(normalized.openingMerge.mergeMultiWindows).toBe(true)
  })

  it('explicit false survives normalize + parse', () => {
    const raw = {
      version: 1,
      defaults: createFactoryUserSettings().defaults,
      openingMerge: { mergeDoubleDoors: false, mergeMultiWindows: false },
    }
    const normalized = normalizeUserSettings(raw)
    expect(normalized.openingMerge.mergeDoubleDoors).toBe(false)
    expect(normalized.openingMerge.mergeMultiWindows).toBe(false)

    const parsed = parseUserSettingsJson(JSON.stringify(raw))
    expect(parsed.openingMerge.mergeDoubleDoors).toBe(false)
    expect(parsed.openingMerge.mergeMultiWindows).toBe(false)
  })
})
