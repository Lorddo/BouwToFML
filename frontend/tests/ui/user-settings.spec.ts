import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFactoryUserSettings,
  exportUserSettingsJson,
  loadUserSettings,
  normalizeUserSettings,
  parseUserSettingsJson,
  resetUserSettingsToFactory,
  saveUserSettings,
  setShowCanvasGrid,
  setShowRoofOverlayOnPlan,
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
    expect(settings.unitSystem).toBe('metric')
    expect(settings.scaleInputUnit).toBe('mm')
    expect(settings.fmlViewer.underlayOpacityPct).toBe(25)
    expect(settings.fmlViewer.fmlOpacityPct).toBe(80)
    expect(settings.fmlViewer.cornerMarkerMode).toBe('skew')
  })

  it('save/load roundtrip', () => {
    const next = createFactoryUserSettings()
    next.locale = 'nl'
    next.unitSystem = 'imperial'
    next.scaleInputUnit = 'm'
    next.defaults.wallHeightCm = 300
    next.defaults.thicknessCms = [8, 20, 30]
    next.fmlViewer.underlayOpacityPct = 40
    next.fmlViewer.fmlOpacityPct = 90
    saveUserSettings(next)
    expect(loadUserSettings().locale).toBe('nl')
    expect(loadUserSettings().unitSystem).toBe('imperial')
    expect(loadUserSettings().scaleInputUnit).toBe('m')
    expect(loadUserSettings().defaults.wallHeightCm).toBe(300)
    expect(loadUserSettings().defaults.thicknessCms).toEqual([8, 20, 30])
    expect(loadUserSettings().defaults.thicknessMinCm).toBe(8)
    expect(loadUserSettings().fmlViewer).toEqual({
      underlayOpacityPct: 40,
      fmlOpacityPct: 90,
      cornerMarkerMode: 'skew',
      openingColors: {
        door: '#f59e0b',
        window: '#06b6d4',
        bovenlicht: '#16a34a',
      },
      slicerOffsetSnapCm: 50,
      planDisplayStyle: 'editor',
      ridgeDisplayWidthCm: 10,
      showRidgeDisplay: true,
      showCanvasGrid: true,
      showRoofOverlayOnPlan: true,
      showRoofPlanesOnPlan: true,
      showClearHeight150: true,
      showClearHeight200: false,
      showClearHeightPlanFill: false,
      clearHeightFillColor: '#6366F1',
      facadeGroups: [
        { id: 'front', name: 'Front' },
        { id: 'back', name: 'Back' },
        { id: 'left', name: 'Left' },
        { id: 'right', name: 'Right' },
      ],
    })
  })

  it('showCanvasGrid factory true; missing → true; false preserved', () => {
    expect(createFactoryUserSettings().fmlViewer.showCanvasGrid).toBe(true)
    expect(normalizeUserSettings({ version: 1, defaults: {} }).fmlViewer.showCanvasGrid).toBe(true)
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { showCanvasGrid: false },
      }).fmlViewer.showCanvasGrid,
    ).toBe(false)
    const next = createFactoryUserSettings()
    next.fmlViewer.showCanvasGrid = false
    saveUserSettings(next)
    expect(loadUserSettings().fmlViewer.showCanvasGrid).toBe(false)
    expect(setShowCanvasGrid(true)).toBe(true)
    expect(loadUserSettings().fmlViewer.showCanvasGrid).toBe(true)
  })

  it('showRoofOverlayOnPlan factory true; missing → true; false preserved', () => {
    expect(createFactoryUserSettings().fmlViewer.showRoofOverlayOnPlan).toBe(true)
    expect(createFactoryUserSettings().fmlViewer.showRoofPlanesOnPlan).toBe(true)
    expect(
      normalizeUserSettings({ version: 1, defaults: {} }).fmlViewer.showRoofOverlayOnPlan,
    ).toBe(true)
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { showRoofOverlayOnPlan: false, showRoofPlanesOnPlan: false },
      }).fmlViewer,
    ).toMatchObject({ showRoofOverlayOnPlan: false, showRoofPlanesOnPlan: false })
    expect(setShowRoofOverlayOnPlan(false)).toBe(false)
    expect(loadUserSettings().fmlViewer.showRoofOverlayOnPlan).toBe(false)
    expect(setShowRoofOverlayOnPlan(true)).toBe(true)
  })

  it('normalize missing/invalid locale → en; accepts nl/th', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).locale).toBe('en')
    expect(normalizeUserSettings({ version: 1, locale: 'de', defaults: {} }).locale).toBe('en')
    expect(normalizeUserSettings({ version: 1, locale: 'th', defaults: {} }).locale).toBe('th')
    expect(normalizeUserSettings({ version: 1, locale: 'nl', defaults: {} }).locale).toBe('nl')
  })

  it('normalize missing/invalid unitSystem → metric; accepts imperial', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).unitSystem).toBe('metric')
    expect(normalizeUserSettings({ version: 1, unitSystem: 'foo', defaults: {} }).unitSystem).toBe(
      'metric',
    )
    expect(
      normalizeUserSettings({ version: 1, unitSystem: 'imperial', defaults: {} }).unitSystem,
    ).toBe('imperial')
  })

  it('normalize missing/invalid scaleInputUnit → mm; accepts cm/m/ft-in', () => {
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
    expect(
      normalizeUserSettings({ version: 1, scaleInputUnit: 'ft-in', defaults: {} }).scaleInputUnit,
    ).toBe('ft-in')
  })

  it('parseUserSettingsJson accepts missing locale → en', () => {
    const json = JSON.stringify({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    expect(parseUserSettingsJson(json).locale).toBe('en')
  })

  it('parseUserSettingsJson accepts missing scaleInputUnit / unitSystem → factory', () => {
    const json = JSON.stringify({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    expect(parseUserSettingsJson(json).scaleInputUnit).toBe('mm')
    expect(parseUserSettingsJson(json).unitSystem).toBe('metric')
  })

  it('write-through thickness localStorage on save', () => {
    const next = createFactoryUserSettings()
    next.defaults.thicknessCms = [9, 18, 28]
    next.defaults.bandMidBoundaryCm = 11
    next.defaults.bandMaxBoundaryCm = 22
    saveUserSettings(next)
    expect(loadFmlWallThicknessLimits()).toEqual({
      minCm: 9,
      midCm: 18,
      maxCm: 28,
      thicknessCms: [9, 18, 28],
    })
    // Meetband komt uit muur-REF — settings schrijven fabrieksbanden niet door.
    expect(loadFmlThicknessBandBoundaries()).toEqual({
      midBoundaryCm: createFactoryUserSettings().defaults.bandMidBoundaryCm,
      maxBoundaryCm: createFactoryUserSettings().defaults.bandMaxBoundaryCm,
    })
  })

  it('legacy load: alleen min/mid/max → catalogus [10,20,30]', () => {
    const normalized = normalizeUserSettings({
      version: 1,
      defaults: {
        thicknessMinCm: 10,
        thicknessMidCm: 20,
        thicknessMaxCm: 30,
      },
    })
    expect(normalized.defaults.thicknessCms).toEqual([10, 20, 30])
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
    expect(normalized.fmlViewer.cornerMarkerMode).toBe('skew')
    expect(normalized.defaults.dakThicknessCm).toBe(30)
    expect(normalized.defaults.slabThicknessCm).toBe(20)
    expect(normalized.fmlViewer.ridgeDisplayWidthCm).toBe(10)
  })

  it('normalize cornerMarkerMode: missing/invalid → skew; accepts off/square', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).fmlViewer.cornerMarkerMode).toBe(
      'skew',
    )
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { cornerMarkerMode: 'both' },
      }).fmlViewer.cornerMarkerMode,
    ).toBe('skew')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { cornerMarkerMode: 'off' },
      }).fmlViewer.cornerMarkerMode,
    ).toBe('off')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { cornerMarkerMode: 'square' },
      }).fmlViewer.cornerMarkerMode,
    ).toBe('square')
  })

  it('parseUserSettingsJson accepts missing fmlViewer', () => {
    const json = JSON.stringify({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    const parsed = parseUserSettingsJson(json)
    expect(parsed.fmlViewer).toEqual({
      underlayOpacityPct: 25,
      fmlOpacityPct: 80,
      cornerMarkerMode: 'skew',
      openingColors: {
        door: '#f59e0b',
        window: '#06b6d4',
        bovenlicht: '#16a34a',
      },
      slicerOffsetSnapCm: 50,
      planDisplayStyle: 'editor',
      ridgeDisplayWidthCm: 10,
      showRidgeDisplay: true,
      showCanvasGrid: true,
      showRoofOverlayOnPlan: true,
      showRoofPlanesOnPlan: true,
      showClearHeight150: true,
      showClearHeight200: false,
      showClearHeightPlanFill: false,
      clearHeightFillColor: '#6366F1',
      facadeGroups: [
        { id: 'front', name: 'Front' },
        { id: 'back', name: 'Back' },
        { id: 'left', name: 'Left' },
        { id: 'right', name: 'Right' },
      ],
    })
  })

  it('normalize planDisplayStyle: missing/invalid → editor; accepts bouw + architect', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).fmlViewer.planDisplayStyle).toBe(
      'editor',
    )
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { planDisplayStyle: 'architect' },
      }).fmlViewer.planDisplayStyle,
    ).toBe('architect')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { planDisplayStyle: 'bouw' },
      }).fmlViewer.planDisplayStyle,
    ).toBe('bouw')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { planDisplayStyle: 'nope' },
      }).fmlViewer.planDisplayStyle,
    ).toBe('editor')
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

  it('facadeGroups factory 4; missing → factory; empty array blijft leeg', () => {
    expect(createFactoryUserSettings().fmlViewer.facadeGroups).toEqual([
      { id: 'front', name: 'Front' },
      { id: 'back', name: 'Back' },
      { id: 'left', name: 'Left' },
      { id: 'right', name: 'Right' },
    ])
    expect(normalizeUserSettings({ version: 1, defaults: {} }).fmlViewer.facadeGroups).toEqual(
      createFactoryUserSettings().fmlViewer.facadeGroups,
    )
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: { facadeGroups: [] },
      }).fmlViewer.facadeGroups,
    ).toEqual([])
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        fmlViewer: {
          facadeGroups: [
            { id: 'stamp', name: 'Stempel' },
            { id: 'front', name: 'Straat' },
            { id: 'front', name: 'dup' },
          ],
        },
      }).fmlViewer.facadeGroups,
    ).toEqual([{ id: 'front', name: 'Straat' }])
  })
})
