import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import { normalizeRoomTagColors } from '@/core/fml/roomtype-catalog'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import {
  DEFAULT_FML_WALL_THICKNESS_LIMITS,
  saveFmlWallThicknessLimits,
} from '@/core/fml/fml-wall-thickness-limits'
import { DEFAULT_FML_BAND_BOUNDARIES } from '@/core/fml/fml-wall-thickness-tiers'
import type { ProjectFmlDefaults } from '@/ui/composables/project/types'
import { DEFAULT_LOCALE, normalizeLocale, type AppLocale } from '@/ui/i18n'
import {
  DEFAULT_SCALE_INPUT_UNIT,
  normalizeScaleInputUnit,
  type ScaleInputUnit,
} from './scale-input-unit'
import {
  DEFAULT_CORNER_MARKER_MODE,
  normalizeCornerMarkerMode,
  type CornerMarkerMode,
} from './corner-marker-mode'
import {
  createFactoryOpeningDisplayColors,
  normalizeOpeningDisplayColors,
  type OpeningDisplayColors,
} from './opening-display-colors'

export type { ScaleInputUnit } from './scale-input-unit'
export {
  DEFAULT_SCALE_INPUT_UNIT,
  SCALE_INPUT_UNITS,
  mmToScaleInput,
  normalizeScaleInputUnit,
  scaleInputStep,
  scaleInputToMm,
} from './scale-input-unit'
export type { CornerMarkerMode } from './corner-marker-mode'
export {
  CORNER_MARKER_MODES,
  DEFAULT_CORNER_MARKER_MODE,
  normalizeCornerMarkerMode,
} from './corner-marker-mode'
export type { OpeningDisplayColorKey, OpeningDisplayColors } from './opening-display-colors'
export {
  FACTORY_OPENING_COLORS,
  createFactoryOpeningDisplayColors,
  normalizeOpeningDisplayColors,
} from './opening-display-colors'

export const USER_SETTINGS_STORAGE_KEY = 'bouwToFml.userSettings'
export const USER_SETTINGS_VERSION = 1 as const

/** Factory FML-viewer opacities (percent 0–100). */
export const DEFAULT_FML_UNDERLAY_OPACITY_PCT = 25
export const DEFAULT_FML_CONTENT_OPACITY_PCT = 80

export type FmlViewerSettings = {
  underlayOpacityPct: number
  fmlOpacityPct: number
  /** Overlay: binnenhoeken H+V / scheef. */
  cornerMarkerMode: CornerMarkerMode
  /** Preview-kleuren deuren / ramen / bovenlicht-hartlijn. */
  openingColors: OpeningDisplayColors
}

/** Auto-merge bij FML-conversie (X-10 / R-27); factory aan = huidig gedrag. */
export type FmlConversionSettings = {
  mergeDoubleDoors: boolean
  mergeMultiWindows: boolean
}

export type UserSettingsV1 = {
  version: typeof USER_SETTINGS_VERSION
  locale: AppLocale
  /** Alleen schaalliniaal-invoer (stap 1); doorrekening blijft mm. */
  scaleInputUnit: ScaleInputUnit
  defaults: ProjectFmlDefaults
  fmlViewer: FmlViewerSettings
  fmlConversion: FmlConversionSettings
  /** Per-role kleur-overrides t.o.v. roomtype-catalogus (alleen afwijkingen). */
  roomTagColors: Record<string, string>
}

export class UserSettingsParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserSettingsParseError'
  }
}

function positiveCm(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Gap/dorpel-offset: 0 toegestaan (direct op de opening). */
function nonNegativeCm(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function clampOpacityPct(raw: unknown, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function createFactoryFmlDefaults(): ProjectFmlDefaults {
  return {
    wallHeightCm: DEFAULT_FML_WALL_HEIGHT_CM,
    doorHeightCm: DEFAULT_FML_DOOR_HEIGHT_CM,
    windowHeightCm: DEFAULT_FML_WINDOW_HEIGHT_CM,
    windowSillZCm: DEFAULT_FML_WINDOW_SILL_Z_CM,
    bovenlichtDefault: false,
    windowBovenlichtDefault: false,
    bovenlichtHeightCm: BOVENLICHT_HEIGHT_CM,
    bovenlichtGapCm: BOVENLICHT_GAP_CM,
    thicknessMinCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.minCm,
    thicknessMidCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.midCm,
    thicknessMaxCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.maxCm,
    bandMidBoundaryCm: DEFAULT_FML_BAND_BOUNDARIES.midBoundaryCm,
    bandMaxBoundaryCm: DEFAULT_FML_BAND_BOUNDARIES.maxBoundaryCm,
  }
}

export function createFactoryFmlViewerSettings(): FmlViewerSettings {
  return {
    underlayOpacityPct: DEFAULT_FML_UNDERLAY_OPACITY_PCT,
    fmlOpacityPct: DEFAULT_FML_CONTENT_OPACITY_PCT,
    cornerMarkerMode: DEFAULT_CORNER_MARKER_MODE,
    openingColors: createFactoryOpeningDisplayColors(),
  }
}

export function createFactoryFmlConversionSettings(): FmlConversionSettings {
  return {
    mergeDoubleDoors: true,
    mergeMultiWindows: true,
  }
}

export function createFactoryUserSettings(): UserSettingsV1 {
  return {
    version: USER_SETTINGS_VERSION,
    locale: DEFAULT_LOCALE,
    scaleInputUnit: DEFAULT_SCALE_INPUT_UNIT,
    defaults: createFactoryFmlDefaults(),
    fmlViewer: createFactoryFmlViewerSettings(),
    fmlConversion: createFactoryFmlConversionSettings(),
    roomTagColors: {},
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function normalizeDefaults(
  raw: unknown,
  factory: ProjectFmlDefaults = createFactoryFmlDefaults(),
): ProjectFmlDefaults {
  const src = asRecord(raw)
  return {
    wallHeightCm: positiveCm(src.wallHeightCm, factory.wallHeightCm),
    doorHeightCm: positiveCm(src.doorHeightCm, factory.doorHeightCm),
    windowHeightCm: positiveCm(src.windowHeightCm, factory.windowHeightCm),
    windowSillZCm: positiveCm(src.windowSillZCm, factory.windowSillZCm),
    bovenlichtDefault: typeof src.bovenlichtDefault === 'boolean' ? src.bovenlichtDefault : false,
    windowBovenlichtDefault:
      typeof src.windowBovenlichtDefault === 'boolean' ? src.windowBovenlichtDefault : false,
    bovenlichtHeightCm: positiveCm(src.bovenlichtHeightCm, factory.bovenlichtHeightCm),
    bovenlichtGapCm: nonNegativeCm(src.bovenlichtGapCm, factory.bovenlichtGapCm),
    thicknessMinCm: positiveCm(src.thicknessMinCm, factory.thicknessMinCm),
    thicknessMidCm: positiveCm(src.thicknessMidCm, factory.thicknessMidCm),
    thicknessMaxCm: positiveCm(src.thicknessMaxCm, factory.thicknessMaxCm),
    // Meetband = REF-afgeleid; settings bewaren alleen fabrieks-fallback (geen user-override).
    bandMidBoundaryCm: factory.bandMidBoundaryCm,
    bandMaxBoundaryCm: factory.bandMaxBoundaryCm,
  }
}

function normalizeFmlViewer(
  raw: unknown,
  factory: FmlViewerSettings = createFactoryFmlViewerSettings(),
): FmlViewerSettings {
  const src = asRecord(raw)
  return {
    underlayOpacityPct: clampOpacityPct(src.underlayOpacityPct, factory.underlayOpacityPct),
    fmlOpacityPct: clampOpacityPct(src.fmlOpacityPct, factory.fmlOpacityPct),
    cornerMarkerMode: normalizeCornerMarkerMode(src.cornerMarkerMode ?? factory.cornerMarkerMode),
    openingColors: normalizeOpeningDisplayColors(src.openingColors ?? factory.openingColors),
  }
}

function normalizeFmlConversion(
  raw: unknown,
  factory: FmlConversionSettings = createFactoryFmlConversionSettings(),
): FmlConversionSettings {
  const src = asRecord(raw)
  return {
    mergeDoubleDoors:
      typeof src.mergeDoubleDoors === 'boolean' ? src.mergeDoubleDoors : factory.mergeDoubleDoors,
    mergeMultiWindows:
      typeof src.mergeMultiWindows === 'boolean'
        ? src.mergeMultiWindows
        : factory.mergeMultiWindows,
  }
}

export function normalizeUserSettings(raw: unknown): UserSettingsV1 {
  const factory = createFactoryUserSettings()
  if (!raw || typeof raw !== 'object') return factory
  const obj = raw as Partial<UserSettingsV1> & Record<string, unknown>
  return {
    version: USER_SETTINGS_VERSION,
    locale: normalizeLocale(obj.locale),
    scaleInputUnit: normalizeScaleInputUnit(obj.scaleInputUnit),
    defaults: normalizeDefaults(obj.defaults, factory.defaults),
    fmlViewer: normalizeFmlViewer(obj.fmlViewer, factory.fmlViewer),
    fmlConversion: normalizeFmlConversion(obj.fmlConversion, factory.fmlConversion),
    roomTagColors: normalizeRoomTagColors(obj.roomTagColors),
  }
}

/**
 * Strict parse for import. Requires version: 1 and a defaults object.
 * Missing fmlViewer / fmlConversion / scaleInputUnit → factory (forward-compatible).
 */
export function parseUserSettingsJson(raw: string): UserSettingsV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new UserSettingsParseError('settings.parseInvalidJson')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new UserSettingsParseError('settings.parseNotObject')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.version !== USER_SETTINGS_VERSION) {
    throw new UserSettingsParseError('settings.parseVersion')
  }
  if (!obj.defaults || typeof obj.defaults !== 'object') {
    throw new UserSettingsParseError('settings.parseMissingDefaults')
  }
  return {
    version: USER_SETTINGS_VERSION,
    locale: normalizeLocale(obj.locale),
    scaleInputUnit: normalizeScaleInputUnit(obj.scaleInputUnit),
    defaults: normalizeDefaults(obj.defaults),
    fmlViewer: normalizeFmlViewer(obj.fmlViewer),
    fmlConversion: normalizeFmlConversion(obj.fmlConversion),
    roomTagColors: normalizeRoomTagColors(obj.roomTagColors),
  }
}

export function loadUserSettings(): UserSettingsV1 {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY)
    if (!raw) return createFactoryUserSettings()
    return normalizeUserSettings(JSON.parse(raw) as unknown)
  } catch {
    return createFactoryUserSettings()
  }
}

/** Alleen export-diktes; meetband komt uit muur-REF (`deriveFmlBandBoundariesCmFromRefPx`). */
function writeThroughThickness(defaults: ProjectFmlDefaults): void {
  saveFmlWallThicknessLimits({
    minCm: defaults.thicknessMinCm,
    midCm: defaults.thicknessMidCm,
    maxCm: defaults.thicknessMaxCm,
  })
}

export function saveUserSettings(settings: UserSettingsV1): UserSettingsV1 {
  const normalized = normalizeUserSettings(settings)
  try {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* localStorage unavailable */
  }
  writeThroughThickness(normalized.defaults)
  return normalized
}

export function resetUserSettingsToFactory(): UserSettingsV1 {
  return saveUserSettings(createFactoryUserSettings())
}

export function exportUserSettingsJson(settings?: UserSettingsV1): string {
  const payload = settings ? normalizeUserSettings(settings) : loadUserSettings()
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function downloadUserSettingsJson(
  settings?: UserSettingsV1,
  filename = 'bouwtofml-settings.json',
): void {
  const json = exportUserSettingsJson(settings)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
