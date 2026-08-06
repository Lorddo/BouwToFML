import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFactoryUserSettings,
  exportUserSettingsJson,
  loadUserSettings,
  normalizeUserSettings,
  parseUserSettingsJson,
  resetUserSettingsToFactory,
  saveUserSettings,
  UserSettingsParseError,
} from '@/ui/composables/settings/user-settings'
import { createDefaultFloorFmlDefaults } from '@/ui/composables/project/defaults'
import { loadFmlWallThicknessLimits } from '@/core/fml/fml-wall-thickness-limits'
import { loadFmlThicknessBandBoundaries } from '@/core/fml/fml-wall-thickness-tiers'

const mockStorage = (() => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  configurable: true,
})

beforeEach(() => {
  mockStorage.clear()
})

afterEach(() => {
  mockStorage.clear()
})

describe('user-settings', () => {
  it('load without storage returns factory', () => {
    const settings = loadUserSettings()
    expect(settings).toEqual(createFactoryUserSettings())
    expect(settings.scaleInputUnit).toBe('mm')
    expect(settings.fmlViewer.underlayOpacityPct).toBe(25)
    expect(settings.fmlViewer.fmlOpacityPct).toBe(80)
  })

  it('save/load roundtrip', () => {
    const next = createFactoryUserSettings()
    next.locale = 'nl'
    next.scaleInputUnit = 'm'
    next.defaults.wallHeightCm = 300
    next.defaults.thicknessMinCm = 8
    next.fmlViewer.underlayOpacityPct = 40
    next.fmlViewer.fmlOpacityPct = 90
    saveUserSettings(next)
    expect(loadUserSettings().locale).toBe('nl')
    expect(loadUserSettings().scaleInputUnit).toBe('m')
    expect(loadUserSettings().defaults.wallHeightCm).toBe(300)
    expect(loadUserSettings().defaults.thicknessMinCm).toBe(8)
    expect(loadUserSettings().fmlViewer).toEqual({ underlayOpacityPct: 40, fmlOpacityPct: 90 })
  })

  it('normalize missing/invalid locale → en; accepts nl/th', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).locale).toBe('en')
    expect(normalizeUserSettings({ version: 1, locale: 'de', defaults: {} }).locale).toBe('en')
    expect(normalizeUserSettings({ version: 1, locale: 'th', defaults: {} }).locale).toBe('th')
    expect(normalizeUserSettings({ version: 1, locale: 'nl', defaults: {} }).locale).toBe('nl')
  })

  it('normalize missing/invalid scaleInputUnit → mm; accepts cm/m', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).scaleInputUnit).toBe('mm')
    expect(
      normalizeUserSettings({ version: 1, scaleInputUnit: 'inch', defaults: {} }).scaleInputUnit,
    ).toBe('mm')
    expect(
      normalizeUserSettings({ version: 1, scaleInputUnit: 'cm', defaults: {} }).scaleInputUnit,
    ).toBe('cm')
    expect(
      normalizeUserSettings({ version: 1, scaleInputUnit: 'm', defaults: {} }).scaleInputUnit,
    ).toBe('m')
  })

  it('parseUserSettingsJson accepts missing locale → en', () => {
    const json = JSON.stringify({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    expect(parseUserSettingsJson(json).locale).toBe('en')
  })

  it('parseUserSettingsJson accepts missing scaleInputUnit → mm', () => {
    const json = JSON.stringify({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    expect(parseUserSettingsJson(json).scaleInputUnit).toBe('mm')
  })

  it('write-through thickness localStorage on save', () => {
    const next = createFactoryUserSettings()
    next.defaults.thicknessMinCm = 9
    next.defaults.thicknessMidCm = 18
    next.defaults.thicknessMaxCm = 28
    next.defaults.bandMidBoundaryCm = 11
    next.defaults.bandMaxBoundaryCm = 22
    saveUserSettings(next)
    expect(loadFmlWallThicknessLimits()).toEqual({ minCm: 9, midCm: 18, maxCm: 28 })
    // Meetband komt uit muur-REF — settings schrijven fabrieksbanden niet door.
    expect(loadFmlThicknessBandBoundaries()).toEqual({
      midBoundaryCm: createFactoryUserSettings().defaults.bandMidBoundaryCm,
      maxBoundaryCm: createFactoryUserSettings().defaults.bandMaxBoundaryCm,
    })
  })

  it('normalize clamps opacity 0–100 and falls back invalid cm', () => {
    const normalized = normalizeUserSettings({
      version: 1,
      defaults: {
        wallHeightCm: -1,
        doorHeightCm: 200,
        windowHeightCm: 'x',
        windowSillZCm: 50,
        bovenlichtDefault: true,
        windowBovenlichtDefault: true,
        bovenlichtHeightCm: 35,
        bovenlichtGapCm: 8,
        thicknessMinCm: 0,
        thicknessMidCm: 15,
        thicknessMaxCm: 25,
        bandMidBoundaryCm: 10,
        bandMaxBoundaryCm: 20,
      },
      fmlViewer: { underlayOpacityPct: 150, fmlOpacityPct: -5 },
    })
    expect(normalized.defaults.wallHeightCm).toBe(createFactoryUserSettings().defaults.wallHeightCm)
    expect(normalized.defaults.doorHeightCm).toBe(200)
    expect(normalized.defaults.windowHeightCm).toBe(
      createFactoryUserSettings().defaults.windowHeightCm,
    )
    expect(normalized.defaults.bovenlichtDefault).toBe(true)
    expect(normalized.defaults.windowBovenlichtDefault).toBe(true)
    expect(normalized.defaults.bovenlichtHeightCm).toBe(35)
    expect(normalized.defaults.bovenlichtGapCm).toBe(8)
    expect(normalized.fmlViewer.underlayOpacityPct).toBe(100)
    expect(normalized.fmlViewer.fmlOpacityPct).toBe(0)
  })

  it('parseUserSettingsJson accepts missing fmlViewer', () => {
    const json = JSON.stringify({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    const parsed = parseUserSettingsJson(json)
    expect(parsed.fmlViewer).toEqual({ underlayOpacityPct: 25, fmlOpacityPct: 80 })
  })

  it('parseUserSettingsJson rejects bad version / missing defaults', () => {
    expect(() => parseUserSettingsJson('{"version":2,"defaults":{}}')).toThrow(
      UserSettingsParseError,
    )
    expect(() => parseUserSettingsJson('{"version":1}')).toThrow(UserSettingsParseError)
    expect(() => parseUserSettingsJson('not-json')).toThrow(UserSettingsParseError)
  })

  it('export JSON is pretty and roundtrips via parse', () => {
    const settings = createFactoryUserSettings()
    settings.defaults.doorHeightCm = 210
    const json = exportUserSettingsJson(settings)
    expect(json).toContain('\n')
    expect(parseUserSettingsJson(json).defaults.doorHeightCm).toBe(210)
  })

  it('resetUserSettingsToFactory restores factory and clears custom storage', () => {
    const next = createFactoryUserSettings()
    next.defaults.wallHeightCm = 999
    next.fmlViewer.fmlOpacityPct = 10
    saveUserSettings(next)
    const reset = resetUserSettingsToFactory()
    expect(reset).toEqual(createFactoryUserSettings())
    expect(loadUserSettings()).toEqual(createFactoryUserSettings())
  })

  it('createDefaultFloorFmlDefaults reads user settings', () => {
    const next = createFactoryUserSettings()
    next.defaults.wallHeightCm = 310
    next.defaults.doorHeightCm = 230
    saveUserSettings(next)
    expect(createDefaultFloorFmlDefaults().wallHeightCm).toBe(310)
    expect(createDefaultFloorFmlDefaults().doorHeightCm).toBe(230)
  })
})
