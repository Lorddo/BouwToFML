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
  USER_SETTINGS_STORAGE_KEY,
  UserSettingsParseError,
} from '@/ui/composables/settings/user-settings'
import { createDefaultFloorDefaults } from '@/ui/composables/project/defaults'
import { loadWallThicknessLimits } from '@/core/plan/wall-thickness-limits'
import { loadThicknessBandBoundaries } from '@/core/plan/wall-thickness-tiers'

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
    expect(settings.planDisplay.underlayOpacityPct).toBe(25)
    expect(settings.planDisplay.contentOpacityPct).toBe(80)
    expect(settings.planDisplay.cornerMarkerMode).toBe('skew')
  })

  it('save/load roundtrip', () => {
    const next = createFactoryUserSettings()
    next.locale = 'nl'
    next.unitSystem = 'imperial'
    next.scaleInputUnit = 'm'
    next.defaults.wallHeightCm = 300
    next.defaults.thicknessCms = [8, 20, 30]
    next.planDisplay.underlayOpacityPct = 40
    next.planDisplay.contentOpacityPct = 90
    saveUserSettings(next)
    expect(loadUserSettings().locale).toBe('nl')
    expect(loadUserSettings().unitSystem).toBe('imperial')
    expect(loadUserSettings().scaleInputUnit).toBe('m')
    expect(loadUserSettings().defaults.wallHeightCm).toBe(300)
    expect(loadUserSettings().defaults.thicknessCms).toEqual([8, 20, 30])
    expect(loadUserSettings().defaults.thicknessMinCm).toBe(8)
    expect(loadUserSettings().planDisplay).toEqual({
      underlayOpacityPct: 40,
      contentOpacityPct: 90,
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
      showOpeningFrameEdit: true,
      openingFrameDefaults: {
        door: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
        window: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
      },
    })
  })

  it('showCanvasGrid factory true; missing → true; false preserved', () => {
    expect(createFactoryUserSettings().planDisplay.showCanvasGrid).toBe(true)
    expect(normalizeUserSettings({ version: 1, defaults: {} }).planDisplay.showCanvasGrid).toBe(true)
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { showCanvasGrid: false },
      }).planDisplay.showCanvasGrid,
    ).toBe(false)
    const next = createFactoryUserSettings()
    next.planDisplay.showCanvasGrid = false
    saveUserSettings(next)
    expect(loadUserSettings().planDisplay.showCanvasGrid).toBe(false)
    expect(setShowCanvasGrid(true)).toBe(true)
    expect(loadUserSettings().planDisplay.showCanvasGrid).toBe(true)
  })

  it('showRoofOverlayOnPlan factory true; missing → true; false preserved', () => {
    expect(createFactoryUserSettings().planDisplay.showRoofOverlayOnPlan).toBe(true)
    expect(createFactoryUserSettings().planDisplay.showRoofPlanesOnPlan).toBe(true)
    expect(
      normalizeUserSettings({ version: 1, defaults: {} }).planDisplay.showRoofOverlayOnPlan,
    ).toBe(true)
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { showRoofOverlayOnPlan: false, showRoofPlanesOnPlan: false },
      }).planDisplay,
    ).toMatchObject({ showRoofOverlayOnPlan: false, showRoofPlanesOnPlan: false })
    expect(setShowRoofOverlayOnPlan(false)).toBe(false)
    expect(loadUserSettings().planDisplay.showRoofOverlayOnPlan).toBe(false)
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
    expect(loadWallThicknessLimits()).toEqual({
      minCm: 9,
      midCm: 18,
      maxCm: 28,
      thicknessCms: [9, 18, 28],
    })
    // Meetband komt uit muur-REF — settings schrijven fabrieksbanden niet door.
    expect(loadThicknessBandBoundaries()).toEqual({
      midBoundaryCm: createFactoryUserSettings().defaults.bandMidBoundaryCm,
      maxBoundaryCm: createFactoryUserSettings().defaults.bandMaxBoundaryCm,
    })
  })

  it('legacy load: fmlViewer/fmlOpacityPct blijven leesbaar (rename fase 5)', () => {
    const normalized = normalizeUserSettings({
      version: 1,
      fmlViewer: {
        underlayOpacityPct: 40,
        fmlOpacityPct: 55,
        showCanvasGrid: false,
        planDisplayStyle: 'bouw',
      },
    })
    expect(normalized.planDisplay.underlayOpacityPct).toBe(40)
    expect(normalized.planDisplay.contentOpacityPct).toBe(55)
    expect(normalized.planDisplay.showCanvasGrid).toBe(false)
    expect(normalized.planDisplay.planDisplayStyle).toBe('bouw')
  })

  it('legacy load: fmlConversion blijft leesbaar als openingMerge (C-triage D1)', () => {
    const normalized = normalizeUserSettings({
      version: 1,
      fmlConversion: { mergeDoubleDoors: false, mergeMultiWindows: false },
    })
    expect(normalized.openingMerge).toEqual({ mergeDoubleDoors: false, mergeMultiWindows: false })
    // Fabriek staat op true, dus een false uit de oude sleutel bewijst dat hij gelezen is.
    expect(createFactoryUserSettings().openingMerge.mergeDoubleDoors).toBe(true)
  })

  it('legacy load: nieuwe sleutel wint van de oude als beide er staan', () => {
    const normalized = normalizeUserSettings({
      version: 1,
      fmlViewer: { fmlOpacityPct: 55 },
      planDisplay: { contentOpacityPct: 90, fmlOpacityPct: 55 },
    })
    expect(normalized.planDisplay.contentOpacityPct).toBe(90)
  })

  it('legacy load: een browser met alleen fmlViewer in localStorage', () => {
    mockStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        locale: 'nl',
        fmlViewer: { fmlOpacityPct: 33, showRoofOverlayOnPlan: false },
      }),
    )
    const loaded = loadUserSettings()
    expect(loaded.planDisplay.contentOpacityPct).toBe(33)
    expect(loaded.planDisplay.showRoofOverlayOnPlan).toBe(false)
    // Save schrijft alleen de nieuwe vorm terug.
    saveUserSettings(loaded)
    const raw = JSON.parse(mockStorage.getItem(USER_SETTINGS_STORAGE_KEY) ?? '{}')
    expect(raw.planDisplay.contentOpacityPct).toBe(33)
    expect(raw.fmlViewer).toBeUndefined()
    expect(raw.planDisplay.fmlOpacityPct).toBeUndefined()
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
      planDisplay: { underlayOpacityPct: 150, contentOpacityPct: -5 },
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
    expect(normalized.planDisplay.underlayOpacityPct).toBe(100)
    expect(normalized.planDisplay.contentOpacityPct).toBe(0)
    expect(normalized.planDisplay.cornerMarkerMode).toBe('skew')
    expect(normalized.defaults.dakThicknessCm).toBe(30)
    expect(normalized.defaults.slabThicknessCm).toBe(20)
    expect(normalized.planDisplay.ridgeDisplayWidthCm).toBe(10)
  })

  it('normalize cornerMarkerMode: missing/invalid → skew; accepts off/square', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).planDisplay.cornerMarkerMode).toBe(
      'skew',
    )
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { cornerMarkerMode: 'both' },
      }).planDisplay.cornerMarkerMode,
    ).toBe('skew')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { cornerMarkerMode: 'off' },
      }).planDisplay.cornerMarkerMode,
    ).toBe('off')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { cornerMarkerMode: 'square' },
      }).planDisplay.cornerMarkerMode,
    ).toBe('square')
  })

  it('parseUserSettingsJson accepts missing planDisplay', () => {
    const json = JSON.stringify({
      version: 1,
      defaults: createFactoryUserSettings().defaults,
    })
    const parsed = parseUserSettingsJson(json)
    expect(parsed.planDisplay).toEqual({
      underlayOpacityPct: 25,
      contentOpacityPct: 80,
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
      showOpeningFrameEdit: true,
      openingFrameDefaults: {
        door: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 },
        window: { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 },
      },
    })
  })

  it('normalize planDisplayStyle: missing/invalid → editor; accepts bouw + architect', () => {
    expect(normalizeUserSettings({ version: 1, defaults: {} }).planDisplay.planDisplayStyle).toBe(
      'editor',
    )
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { planDisplayStyle: 'architect' },
      }).planDisplay.planDisplayStyle,
    ).toBe('architect')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { planDisplayStyle: 'bouw' },
      }).planDisplay.planDisplayStyle,
    ).toBe('bouw')
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { planDisplayStyle: 'nope' },
      }).planDisplay.planDisplayStyle,
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
    next.planDisplay.contentOpacityPct = 10
    saveUserSettings(next)
    const reset = resetUserSettingsToFactory()
    expect(reset).toEqual(createFactoryUserSettings())
    expect(loadUserSettings()).toEqual(createFactoryUserSettings())
  })

  it('createDefaultFloorDefaults reads user settings', () => {
    const next = createFactoryUserSettings()
    next.defaults.wallHeightCm = 310
    next.defaults.doorHeightCm = 230
    saveUserSettings(next)
    expect(createDefaultFloorDefaults().wallHeightCm).toBe(310)
    expect(createDefaultFloorDefaults().doorHeightCm).toBe(230)
  })

  it('facadeGroups factory 4; missing → factory; empty array blijft leeg', () => {
    expect(createFactoryUserSettings().planDisplay.facadeGroups).toEqual([
      { id: 'front', name: 'Front' },
      { id: 'back', name: 'Back' },
      { id: 'left', name: 'Left' },
      { id: 'right', name: 'Right' },
    ])
    expect(normalizeUserSettings({ version: 1, defaults: {} }).planDisplay.facadeGroups).toEqual(
      createFactoryUserSettings().planDisplay.facadeGroups,
    )
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: { facadeGroups: [] },
      }).planDisplay.facadeGroups,
    ).toEqual([])
    expect(
      normalizeUserSettings({
        version: 1,
        defaults: {},
        planDisplay: {
          facadeGroups: [
            { id: 'stamp', name: 'Stempel' },
            { id: 'front', name: 'Straat' },
            { id: 'front', name: 'dup' },
          ],
        },
      }).planDisplay.facadeGroups,
    ).toEqual([{ id: 'front', name: 'Straat' }])
  })
})
