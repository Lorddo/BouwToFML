import { describe, expect, it } from 'vitest'
import {
  createFactoryUserSettings,
  normalizeUserSettings,
  parseUserSettingsJson,
} from '@/ui/composables/settings/user-settings'

describe('user settings fmlConversion', () => {
  it('factory defaults merge toggles on', () => {
    const factory = createFactoryUserSettings()
    expect(factory.fmlConversion.mergeDoubleDoors).toBe(true)
    expect(factory.fmlConversion.mergeMultiWindows).toBe(true)
  })

  it('missing fmlConversion → factory true (forward-compatible)', () => {
    const normalized = normalizeUserSettings({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    expect(normalized.fmlConversion.mergeDoubleDoors).toBe(true)
    expect(normalized.fmlConversion.mergeMultiWindows).toBe(true)
  })

  it('explicit false survives normalize + parse', () => {
    const raw = {
      version: 1,
      defaults: createFactoryUserSettings().defaults,
      fmlConversion: { mergeDoubleDoors: false, mergeMultiWindows: false },
    }
    const normalized = normalizeUserSettings(raw)
    expect(normalized.fmlConversion.mergeDoubleDoors).toBe(false)
    expect(normalized.fmlConversion.mergeMultiWindows).toBe(false)

    const parsed = parseUserSettingsJson(JSON.stringify(raw))
    expect(parsed.fmlConversion.mergeDoubleDoors).toBe(false)
    expect(parsed.fmlConversion.mergeMultiWindows).toBe(false)
  })
})
