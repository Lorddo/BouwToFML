import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import { normalizeRoomTagColors, parseFmlHex } from '@/core/fml/roomtype-catalog'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import {
  catalogFromLegacyLimits,
  FACTORY_THICKNESS_CMS,
  limitsFromCatalog,
  normalizeThicknessCatalog,
} from '@/core/fml/fml-wall-thickness-catalog'
import {
  DEFAULT_FML_WALL_THICKNESS_LIMITS,
  saveFmlWallThicknessLimits,
} from '@/core/fml/fml-wall-thickness-limits'
import { DEFAULT_FML_BAND_BOUNDARIES } from '@/core/fml/fml-wall-thickness-tiers'
import type { ProjectFmlDefaults } from '@/ui/composables/project/types'
import { DEFAULT_LOCALE, normalizeLocale, type AppLocale } from '@/ui/i18n'
import {
  DEFAULT_SCALE_INPUT_UNIT,
  DEFAULT_UNIT_SYSTEM,
  normalizeScaleInputUnit,
  normalizeUnitSystem,
  type ScaleInputUnit,
  type UnitSystem,
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
import {
  DEFAULT_PLAN_DISPLAY_STYLE,
  normalizePlanDisplayStyle,
  type PlanDisplayStyleChoice,
} from './plan-display-style'
import { DEFAULT_SLICER_OFFSET_SNAP_CM } from '@/core/fml/slice-offset-snap'
import { DEFAULT_FLOOR_THICKNESS_CM, DEFAULT_NOK_THICKNESS_CM } from '@/core/fml/floor-stack'
import { DEFAULT_RIDGE_DISPLAY_WIDTH_CM } from '@/core/fml/ridge-walls'
import {
  createDefaultFacadeGroupPresets,
  MAX_FACADE_GROUP_PRESETS,
  STAMP_FACADE_GROUP_ID,
  type FacadeGroupPreset,
} from '@/core/fml/facade-groups'

export type { ScaleInputUnit, UnitSystem } from './scale-input-unit'
export {
  DEFAULT_SCALE_INPUT_UNIT,
  DEFAULT_UNIT_SYSTEM,
  SCALE_INPUT_UNITS,
  UNIT_SYSTEMS,
  mmToScaleInput,
  normalizeScaleInputUnit,
  normalizeUnitSystem,
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
export type { PlanDisplayStyle, PlanDisplayStyleChoice } from './plan-display-style'
export {
  ARCHITECT_AREA_FILL,
  ARCHITECT_STROKE,
  DEFAULT_PLAN_DISPLAY_STYLE,
  PLAN_DISPLAY_STYLE_CHOICES,
  isArchitectPlanStyle,
  isBouwPlanStyle,
  isLinePlanStyle,
  normalizePlanDisplayStyle,
  planLineStroke,
} from './plan-display-style'

export const USER_SETTINGS_STORAGE_KEY = 'bouwToFml.userSettings'
export const USER_SETTINGS_VERSION = 1 as const

/** Factory FML-viewer opacities (percent 0–100). */
export const DEFAULT_FML_UNDERLAY_OPACITY_PCT = 25
export const DEFAULT_FML_CONTENT_OPACITY_PCT = 80
export { DEFAULT_SLICER_OFFSET_SNAP_CM } from '@/core/fml/slice-offset-snap'

export type EditorSettings = {
  underlayOpacityPct: number
  fmlOpacityPct: number
  /** Overlay: binnenhoeken H+V / scheef. */
  cornerMarkerMode: CornerMarkerMode
  /** Preview-kleuren deuren / ramen / bovenlicht-hartlijn. */
  openingColors: OpeningDisplayColors
  /** Soft-snap P↔M-offset (voorkeur + andere slices). */
  slicerOffsetSnapCm: number
  /** Plattegrond + gevel-verf: editor (kleur) | bouw (CAD-lijnen) | architect (CAD zonder fill). */
  planDisplayStyle: PlanDisplayStyleChoice
  /** Gestippelde nokbalk-breedte (aanzicht + Dak-tab). */
  ridgeDisplayWidthCm: number
  /** Toon gestippelde nokbalk op Dak-tab / plattegrond-overlay. */
  showRidgeDisplay: boolean
  /** Licht viewport-vast hulpraster op alle canvassen (niet in export). */
  showCanvasGrid: boolean
  /** Topbar: hele dak-overlay op de plattegrond (inhoud via vlaggen hieronder). */
  showRoofOverlayOnPlan: boolean
  /** Overlay-inhoud: dakvlak-omtrek op de plattegrond. */
  showRoofPlanesOnPlan: boolean
  /** 1,50 m clear-height overlay (lijn op plattegrond, fill op Dak). */
  showClearHeight150: boolean
  /** 2,00 m clear-height lijn (alleen plattegrond). */
  showClearHeight200: boolean
  /** Optionele arcering/fill onder 1,50 op de plattegrond. */
  showClearHeightPlanFill: boolean
  /** Arcering-/fill-kleur clear-height (`#RRGGBB`). */
  clearHeightFillColor: string
  /** Catalogus voor nieuwe editor-plannen (factory: Front/Back/Left/Right). */
  facadeGroups: FacadeGroupPreset[]
}

/** Auto-merge bij FML-conversie (X-10 / R-27); factory aan = huidig gedrag. */
export type FmlConversionSettings = {
  mergeDoubleDoors: boolean
  mergeMultiWindows: boolean
}

export type UserSettingsV1 = {
  version: typeof USER_SETTINGS_VERSION
  locale: AppLocale
  /** Metric / imperial (onafhankelijk van input type; later FML useMetric). */
  unitSystem: UnitSystem
  /** Schaalliniaal + FML typen (kamer/muur/move); doorrekening blijft cm. */
  scaleInputUnit: ScaleInputUnit
  defaults: ProjectFmlDefaults
  fmlViewer: EditorSettings
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

export const DEFAULT_CLEAR_HEIGHT_FILL_COLOR = '#6366F1'
export const CLEAR_HEIGHT_FILL_ALPHA = 0.18

/** `#RRGGBB` → `rgba(r,g,b,a)` voor clear-height arcering. */
export function clearHeightFillRgba(
  hex: string | undefined | null,
  alpha = CLEAR_HEIGHT_FILL_ALPHA,
): string {
  const parsed = parseFmlHex(hex) ?? DEFAULT_CLEAR_HEIGHT_FILL_COLOR
  const r = Number.parseInt(parsed.slice(1, 3), 16)
  const g = Number.parseInt(parsed.slice(3, 5), 16)
  const b = Number.parseInt(parsed.slice(5, 7), 16)
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : CLEAR_HEIGHT_FILL_ALPHA
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function clampRidgeDisplayWidthCm(raw: unknown, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.max(1, Math.min(80, Math.round(n)))
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
    thicknessCms: [...FACTORY_THICKNESS_CMS],
    thicknessMinCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.minCm,
    thicknessMidCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.midCm,
    thicknessMaxCm: DEFAULT_FML_WALL_THICKNESS_LIMITS.maxCm,
    dakThicknessCm: DEFAULT_NOK_THICKNESS_CM,
    slabThicknessCm: DEFAULT_FLOOR_THICKNESS_CM,
    bandMidBoundaryCm: DEFAULT_FML_BAND_BOUNDARIES.midBoundaryCm,
    bandMaxBoundaryCm: DEFAULT_FML_BAND_BOUNDARIES.maxBoundaryCm,
  }
}

export function createFactoryEditorSettings(): EditorSettings {
  return {
    underlayOpacityPct: DEFAULT_FML_UNDERLAY_OPACITY_PCT,
    fmlOpacityPct: DEFAULT_FML_CONTENT_OPACITY_PCT,
    cornerMarkerMode: DEFAULT_CORNER_MARKER_MODE,
    openingColors: createFactoryOpeningDisplayColors(),
    slicerOffsetSnapCm: DEFAULT_SLICER_OFFSET_SNAP_CM,
    planDisplayStyle: DEFAULT_PLAN_DISPLAY_STYLE,
    ridgeDisplayWidthCm: DEFAULT_RIDGE_DISPLAY_WIDTH_CM,
    showRidgeDisplay: true,
    showCanvasGrid: true,
    showRoofOverlayOnPlan: true,
    showRoofPlanesOnPlan: true,
    showClearHeight150: true,
    showClearHeight200: false,
    showClearHeightPlanFill: false,
    clearHeightFillColor: DEFAULT_CLEAR_HEIGHT_FILL_COLOR,
    facadeGroups: createDefaultFacadeGroupPresets(),
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
    unitSystem: DEFAULT_UNIT_SYSTEM,
    scaleInputUnit: DEFAULT_SCALE_INPUT_UNIT,
    defaults: createFactoryFmlDefaults(),
    fmlViewer: createFactoryEditorSettings(),
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
    ...(() => {
      const rawCatalog = src.thicknessCms
      const catalog = Array.isArray(rawCatalog)
        ? normalizeThicknessCatalog(rawCatalog)
        : catalogFromLegacyLimits({
            minCm: positiveCm(src.thicknessMinCm, factory.thicknessMinCm),
            midCm: positiveCm(src.thicknessMidCm, factory.thicknessMidCm),
            maxCm: positiveCm(src.thicknessMaxCm, factory.thicknessMaxCm),
          })
      const limits = limitsFromCatalog(catalog)
      return {
        thicknessCms: catalog,
        thicknessMinCm: limits.minCm,
        thicknessMidCm: limits.midCm,
        thicknessMaxCm: limits.maxCm,
      }
    })(),
    dakThicknessCm: positiveCm(src.dakThicknessCm, factory.dakThicknessCm),
    slabThicknessCm: positiveCm(src.slabThicknessCm, factory.slabThicknessCm),
    // Meetband = REF-afgeleid; settings bewaren alleen fabrieks-fallback (geen user-override).
    bandMidBoundaryCm: factory.bandMidBoundaryCm,
    bandMaxBoundaryCm: factory.bandMaxBoundaryCm,
  }
}

function normalizeFacadeGroupPresets(
  raw: unknown,
  factory: FacadeGroupPreset[] = createDefaultFacadeGroupPresets(),
): FacadeGroupPreset[] {
  if (!Array.isArray(raw)) return factory.map((row) => ({ ...row }))
  const out: FacadeGroupPreset[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id || id === STAMP_FACADE_GROUP_ID || seen.has(id)) continue
    seen.add(id)
    const name =
      typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : id
    out.push({ id, name })
    if (out.length >= MAX_FACADE_GROUP_PRESETS) break
  }
  return out
}

function normalizeEditor(
  raw: unknown,
  factory: EditorSettings = createFactoryEditorSettings(),
): EditorSettings {
  const src = asRecord(raw)
  return {
    underlayOpacityPct: clampOpacityPct(src.underlayOpacityPct, factory.underlayOpacityPct),
    fmlOpacityPct: clampOpacityPct(src.fmlOpacityPct, factory.fmlOpacityPct),
    cornerMarkerMode: normalizeCornerMarkerMode(src.cornerMarkerMode ?? factory.cornerMarkerMode),
    openingColors: normalizeOpeningDisplayColors(src.openingColors ?? factory.openingColors),
    slicerOffsetSnapCm: positiveCm(src.slicerOffsetSnapCm, factory.slicerOffsetSnapCm),
    planDisplayStyle: normalizePlanDisplayStyle(src.planDisplayStyle ?? factory.planDisplayStyle),
    ridgeDisplayWidthCm: clampRidgeDisplayWidthCm(
      src.ridgeDisplayWidthCm,
      factory.ridgeDisplayWidthCm,
    ),
    showRidgeDisplay:
      typeof src.showRidgeDisplay === 'boolean' ? src.showRidgeDisplay : factory.showRidgeDisplay,
    showCanvasGrid:
      typeof src.showCanvasGrid === 'boolean' ? src.showCanvasGrid : factory.showCanvasGrid,
    showRoofOverlayOnPlan:
      typeof src.showRoofOverlayOnPlan === 'boolean'
        ? src.showRoofOverlayOnPlan
        : factory.showRoofOverlayOnPlan,
    showRoofPlanesOnPlan:
      typeof src.showRoofPlanesOnPlan === 'boolean'
        ? src.showRoofPlanesOnPlan
        : factory.showRoofPlanesOnPlan,
    showClearHeight150:
      typeof src.showClearHeight150 === 'boolean'
        ? src.showClearHeight150
        : factory.showClearHeight150,
    showClearHeight200:
      typeof src.showClearHeight200 === 'boolean'
        ? src.showClearHeight200
        : factory.showClearHeight200,
    showClearHeightPlanFill:
      typeof src.showClearHeightPlanFill === 'boolean'
        ? src.showClearHeightPlanFill
        : factory.showClearHeightPlanFill,
    clearHeightFillColor:
      parseFmlHex(typeof src.clearHeightFillColor === 'string' ? src.clearHeightFillColor : null) ??
      factory.clearHeightFillColor,
    facadeGroups: normalizeFacadeGroupPresets(src.facadeGroups, factory.facadeGroups),
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
    unitSystem: normalizeUnitSystem(obj.unitSystem),
    scaleInputUnit: normalizeScaleInputUnit(obj.scaleInputUnit),
    defaults: normalizeDefaults(obj.defaults, factory.defaults),
    fmlViewer: normalizeEditor(obj.fmlViewer, factory.fmlViewer),
    fmlConversion: normalizeFmlConversion(obj.fmlConversion, factory.fmlConversion),
    roomTagColors: normalizeRoomTagColors(obj.roomTagColors),
  }
}

/**
 * Strict parse for import. Requires version: 1 and a defaults object.
 * Missing fmlViewer / fmlConversion / scaleInputUnit / unitSystem → factory (forward-compatible).
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
    unitSystem: normalizeUnitSystem(obj.unitSystem),
    scaleInputUnit: normalizeScaleInputUnit(obj.scaleInputUnit),
    defaults: normalizeDefaults(obj.defaults),
    fmlViewer: normalizeEditor(obj.fmlViewer),
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
  const catalog = normalizeThicknessCatalog(
    defaults.thicknessCms ??
      catalogFromLegacyLimits({
        minCm: defaults.thicknessMinCm,
        midCm: defaults.thicknessMidCm,
        maxCm: defaults.thicknessMaxCm,
      }),
  )
  const limits = limitsFromCatalog(catalog)
  saveFmlWallThicknessLimits({
    ...limits,
    thicknessCms: catalog,
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

/** Persist canvas guide-grid preference (topbar toggle + Settings). */
export function setShowCanvasGrid(show: boolean): boolean {
  const current = loadUserSettings()
  return saveUserSettings({
    ...current,
    fmlViewer: { ...current.fmlViewer, showCanvasGrid: show === true },
  }).fmlViewer.showCanvasGrid
}

/** Persist plattegrond dak-overlay master (topbar toggle). */
export function setShowRoofOverlayOnPlan(show: boolean): boolean {
  const current = loadUserSettings()
  return saveUserSettings({
    ...current,
    fmlViewer: { ...current.fmlViewer, showRoofOverlayOnPlan: show === true },
  }).fmlViewer.showRoofOverlayOnPlan
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
