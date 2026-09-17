/**
 * Versioned `.plg`-document (Fase C1).
 *
 * `.plg` = bestaande `FloorPlan` + header/settings. Geen parallel objectmodel.
 * Schemakeys schoon (`slices`/`frame`/`role` elders) — FML-extras (`plg*`) horen niet in klant-JSON.
 *
 * Importgrens: type-only `FloorPlan`/`PlanExtras` uit `core/fml` (domein = FloorPlan).
 * `PlgSettings` / `PlgFloorDefaults` / unit-unions zijn hier de **canonieke bron**;
 * `platform/` en `ui/` importeren deze types (niet andersom).
 */
import type { FloorPlan, PlanExtras } from '../plan/types'
import { migratePlg } from './plg-migrations'
import { CURRENT_PLG_VERSION } from './plg-version'
import { normalizePlanIdentities } from './fml-adapter/normalize-plan-identities'
import { PLG_STRIP_FML_EXTRA_KEYS } from './fml-adapter/plg-fml-extras'
import { promotePlanExtensions } from './fml-adapter/registry'

export { CURRENT_PLG_VERSION }
export const PLG_FORMAT = 'plg-plan' as const
export const DEFAULT_PLG_GENERATOR = 'BouwToFML 1.x'

/** Metric / imperial — project-eigendom in `.plg`. */
export type PlgUnitSystem = 'metric' | 'imperial'

/** Invoereenheid voor maten; intern blijft cm. */
export type PlgScaleInputUnit = 'mm' | 'cm' | 'm' | 'ft-in'

/** Plattegrond-/gevel-weergavestijl. */
export type PlgPlanDisplayStyle = 'editor' | 'bouw' | 'architect'

/**
 * Canonieke floor-/project-defaults in het `.plg`-bestand.
 * Converter-gate (banden, min/mid/max) hoort niet hier — zie `limitsFromCatalog`.
 */
export interface PlgFloorDefaults {
  wallHeightCm: number
  doorHeightCm: number
  windowHeightCm: number
  windowSillZCm: number
  bovenlichtDefault: boolean
  windowBovenlichtDefault: boolean
  bovenlichtHeightCm: number
  bovenlichtGapCm: number
  /** Catalogus muurdiktes (min 3, tot 8). */
  thicknessCms: number[]
  dakThicknessCm: number
  slabThicknessCm: number
}

/** Converter-only: afgeleid van `thicknessCms`, niet in `.plg`. */
export const PLG_CONVERTER_DEFAULT_KEYS = [
  'thicknessMinCm',
  'thicknessMidCm',
  'thicknessMaxCm',
  'bandMidBoundaryCm',
  'bandMaxBoundaryCm',
] as const

export function toPlgFloorDefaults(
  defaults: PlgFloorDefaults & Record<string, unknown>,
): PlgFloorDefaults {
  return {
    wallHeightCm: defaults.wallHeightCm,
    doorHeightCm: defaults.doorHeightCm,
    windowHeightCm: defaults.windowHeightCm,
    windowSillZCm: defaults.windowSillZCm,
    bovenlichtDefault: defaults.bovenlichtDefault,
    windowBovenlichtDefault: defaults.windowBovenlichtDefault,
    bovenlichtHeightCm: defaults.bovenlichtHeightCm,
    bovenlichtGapCm: defaults.bovenlichtGapCm,
    thicknessCms: [...defaults.thicknessCms],
    dakThicknessCm: defaults.dakThicknessCm,
    slabThicknessCm: defaults.slabThicknessCm,
  }
}

/**
 * Project-settings die in FML nooit meekwamen.
 * Display/unit-velden + `defaults` (= FloorMeta.defaults).
 */
export interface PlgSettings {
  unitSystem: PlgUnitSystem
  scaleInputUnit: PlgScaleInputUnit
  planDisplayStyle: PlgPlanDisplayStyle
  showCanvasGrid: boolean
  defaults: PlgFloorDefaults
}

export interface PlgProjectMeta {
  id: string
  name: string
  address: string
}

export interface PlgForeign {
  /** Opaque Floorplanner-passthrough; alleen na FML-import. */
  fml?: PlanExtras
}

export interface PlgDocument {
  format: typeof PLG_FORMAT
  version: number
  generator: string
  savedAt: string
  project: PlgProjectMeta
  settings: PlgSettings
  plan: FloorPlan
  foreign?: PlgForeign
}

export class PlgDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlgDocumentError'
  }
}

/** Expliciete top-level volgorde (byte-stabiele write). */
const DOCUMENT_KEYS = [
  'format',
  'version',
  'generator',
  'savedAt',
  'project',
  'settings',
  'plan',
  'foreign',
] as const

const PROJECT_KEYS = ['id', 'name', 'address'] as const

const SETTINGS_KEYS = [
  'unitSystem',
  'scaleInputUnit',
  'planDisplayStyle',
  'showCanvasGrid',
  'defaults',
] as const

const DEFAULTS_KEYS = [
  'wallHeightCm',
  'doorHeightCm',
  'windowHeightCm',
  'windowSillZCm',
  'bovenlichtDefault',
  'windowBovenlichtDefault',
  'bovenlichtHeightCm',
  'bovenlichtGapCm',
  'thicknessCms',
  'dakThicknessCm',
  'slabThicknessCm',
] as const

const FOREIGN_KEYS = ['fml'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Content-sniff: `format: "plg-plan"` — niet de bestandsnaam. */
export function isPlgDocumentJson(value: unknown): boolean {
  return isRecord(value) && value.format === PLG_FORMAT
}

function requireString(record: Record<string, unknown>, key: string, ctx: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new PlgDocumentError(`${ctx}: "${key}" must be a string`)
  }
  return value
}

function requireNumber(record: Record<string, unknown>, key: string, ctx: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PlgDocumentError(`${ctx}: "${key}" must be a finite number`)
  }
  return value
}

function requireBoolean(record: Record<string, unknown>, key: string, ctx: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new PlgDocumentError(`${ctx}: "${key}" must be a boolean`)
  }
  return value
}

function requireNumberArray(record: Record<string, unknown>, key: string, ctx: string): number[] {
  const value = record[key]
  if (!Array.isArray(value) || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new PlgDocumentError(`${ctx}: "${key}" must be an array of finite numbers`)
  }
  return value.slice()
}

/**
 * Bouwt een object in vaste sleutelvolgorde.
 * Ontbrekende keys worden overgeslagen; onbekende keys (niet in `order`)
 * worden alfabetisch achteraan gezet zodat roundtrips niet stilletjes keys droppen.
 */
function pickOrdered(
  source: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const seen = new Set<string>()
  for (const key of order) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    out[key] = source[key]
    seen.add(key)
  }
  const rest = Object.keys(source)
    .filter((key) => !seen.has(key))
    .sort()
  for (const key of rest) {
    out[key] = source[key]
  }
  return out
}

/**
 * Diepe canonieke waardes: arrays behouden volgorde; plain objects krijgen
 * gesorteerde keys. Geen vertrouwen op insert-order van gemuteerde objecten.
 */
function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue)
  }
  if (!isRecord(value)) {
    return value
  }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalizeValue(value[key])
  }
  return out
}

function parseProject(raw: unknown): PlgProjectMeta {
  if (!isRecord(raw)) {
    throw new PlgDocumentError('project must be an object')
  }
  return {
    id: requireString(raw, 'id', 'project'),
    name: requireString(raw, 'name', 'project'),
    address: requireString(raw, 'address', 'project'),
  }
}

function parseFloorDefaults(raw: unknown): PlgFloorDefaults {
  if (!isRecord(raw)) {
    throw new PlgDocumentError('settings.defaults must be an object')
  }
  const ctx = 'settings.defaults'
  return {
    wallHeightCm: requireNumber(raw, 'wallHeightCm', ctx),
    doorHeightCm: requireNumber(raw, 'doorHeightCm', ctx),
    windowHeightCm: requireNumber(raw, 'windowHeightCm', ctx),
    windowSillZCm: requireNumber(raw, 'windowSillZCm', ctx),
    bovenlichtDefault: requireBoolean(raw, 'bovenlichtDefault', ctx),
    windowBovenlichtDefault: requireBoolean(raw, 'windowBovenlichtDefault', ctx),
    bovenlichtHeightCm: requireNumber(raw, 'bovenlichtHeightCm', ctx),
    bovenlichtGapCm: requireNumber(raw, 'bovenlichtGapCm', ctx),
    thicknessCms: requireNumberArray(raw, 'thicknessCms', ctx),
    dakThicknessCm: requireNumber(raw, 'dakThicknessCm', ctx),
    slabThicknessCm: requireNumber(raw, 'slabThicknessCm', ctx),
  }
}

function parseUnitSystem(raw: unknown): PlgUnitSystem {
  if (raw === 'metric' || raw === 'imperial') return raw
  throw new PlgDocumentError('settings.unitSystem must be "metric" or "imperial"')
}

function parseScaleInputUnit(raw: unknown): PlgScaleInputUnit {
  if (raw === 'mm' || raw === 'cm' || raw === 'm' || raw === 'ft-in') return raw
  throw new PlgDocumentError('settings.scaleInputUnit must be "mm" | "cm" | "m" | "ft-in"')
}

function parsePlanDisplayStyle(raw: unknown): PlgPlanDisplayStyle {
  if (raw === 'editor' || raw === 'bouw' || raw === 'architect') return raw
  throw new PlgDocumentError('settings.planDisplayStyle must be "editor" | "bouw" | "architect"')
}

function parseSettings(raw: unknown): PlgSettings {
  if (!isRecord(raw)) {
    throw new PlgDocumentError('settings must be an object')
  }
  return {
    unitSystem: parseUnitSystem(raw.unitSystem),
    scaleInputUnit: parseScaleInputUnit(raw.scaleInputUnit),
    planDisplayStyle: parsePlanDisplayStyle(raw.planDisplayStyle),
    showCanvasGrid: requireBoolean(raw, 'showCanvasGrid', 'settings'),
    defaults: parseFloorDefaults(raw.defaults),
  }
}

function parseForeign(raw: unknown): PlgForeign | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    throw new PlgDocumentError('foreign must be an object when present')
  }
  const foreign: PlgForeign = {}
  if (raw.fml !== undefined) {
    if (!isRecord(raw.fml)) {
      throw new PlgDocumentError('foreign.fml must be an object when present')
    }
    foreign.fml = raw.fml as PlanExtras
  }
  return foreign
}

function parsePlan(raw: unknown): FloorPlan {
  if (!isRecord(raw)) {
    throw new PlgDocumentError('plan must be an object')
  }
  if (typeof raw.name !== 'string') {
    throw new PlgDocumentError('plan.name must be a string')
  }
  if (!Array.isArray(raw.floors)) {
    throw new PlgDocumentError('plan.floors must be an array')
  }
  // Domein blijft FloorPlan; diepe validatie is FML-/editor-territorium.
  return promotePlanExtensions(normalizePlanIdentities(raw as unknown as FloorPlan))
}

function normalizeDocument(raw: unknown): PlgDocument {
  if (!isRecord(raw)) {
    throw new PlgDocumentError('PLG document must be a JSON object')
  }
  if (raw.format !== PLG_FORMAT) {
    throw new PlgDocumentError(`Unsupported PLG format: ${String(raw.format)} (expected "${PLG_FORMAT}")`)
  }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version)) {
    throw new PlgDocumentError('version must be an integer')
  }
  if (raw.version !== CURRENT_PLG_VERSION) {
    throw new PlgDocumentError(
      `PLG version ${raw.version} is not current (expected ${CURRENT_PLG_VERSION}); run migratePlg first`,
    )
  }

  const foreign = parseForeign(raw.foreign)
  const doc: PlgDocument = {
    format: PLG_FORMAT,
    version: CURRENT_PLG_VERSION,
    generator: requireString(raw, 'generator', 'document'),
    savedAt: requireString(raw, 'savedAt', 'document'),
    project: parseProject(raw.project),
    settings: parseSettings(raw.settings),
    plan: parsePlan(raw.plan),
  }
  if (foreign !== undefined) {
    doc.foreign = foreign
  }
  return doc
}

/**
 * Lees een `.plg`-JSON (string of reeds geparsed object).
 * Roep `migratePlg` aan vóór validatie zodat oude versies naar CURRENT komen.
 */
export function readPlg(json: string | object): PlgDocument {
  let raw: unknown
  if (typeof json === 'string') {
    try {
      raw = JSON.parse(json) as unknown
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new PlgDocumentError(`Invalid PLG JSON: ${detail}`)
    }
  } else if (isRecord(json) || Array.isArray(json)) {
    raw = json
  } else {
    throw new PlgDocumentError('PLG input must be a JSON string or object')
  }

  const migrated = migratePlg(raw)
  return normalizeDocument(migrated)
}

function orderDefaults(defaults: PlgFloorDefaults): Record<string, unknown> {
  const fileOnly = toPlgFloorDefaults(defaults as PlgFloorDefaults & Record<string, unknown>)
  return pickOrdered({ ...fileOnly }, DEFAULTS_KEYS)
}

function orderSettings(settings: PlgSettings): Record<string, unknown> {
  return pickOrdered(
    {
      unitSystem: settings.unitSystem,
      scaleInputUnit: settings.scaleInputUnit,
      planDisplayStyle: settings.planDisplayStyle,
      showCanvasGrid: settings.showCanvasGrid,
      defaults: orderDefaults(settings.defaults),
    },
    SETTINGS_KEYS,
  )
}

function orderProject(project: PlgProjectMeta): Record<string, unknown> {
  return pickOrdered({ ...project }, PROJECT_KEYS)
}

function orderForeign(foreign: PlgForeign): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  if (foreign.fml !== undefined) {
    raw.fml = canonicalizeValue(foreign.fml)
  }
  return pickOrdered(raw, FOREIGN_KEYS)
}

/**
 * Session-only velden horen niet in `.plg` (B7: `wall.stampOwned`).
 * FML-extras (`plg*`) evenmin — typed fields only.
 * Werkt op een canonieke deep-copy zodat de caller's plan onaangeroerd blijft.
 */
function stripFmlRefid(extras: Record<string, unknown> | undefined): void {
  if (!extras || !('fmlRefid' in extras)) return
  delete extras.fmlRefid
}

function stripPlgFmlExtraKeys(bag: Record<string, unknown> | undefined): void {
  if (!bag) return
  for (const key of PLG_STRIP_FML_EXTRA_KEYS) {
    if (key in bag) delete bag[key]
  }
}

function stripSessionOnlyFromPlan(plan: FloorPlan): FloorPlan {
  const cloned = canonicalizeValue(plan) as FloorPlan
  const stripWalls = (walls: FloorPlan['floors'][number]['walls'] | undefined) => {
    if (!walls) return
    for (const wall of walls) {
      if (wall && typeof wall === 'object' && 'stampOwned' in wall) {
        delete (wall as { stampOwned?: boolean }).stampOwned
      }
      for (const opening of wall.openings ?? []) {
        const extras = opening.extras as Record<string, unknown> | undefined
        stripFmlRefid(extras)
        stripPlgFmlExtraKeys(extras)
      }
    }
  }
  const stripItems = (items: FloorPlan['floors'][number]['items'] | undefined) => {
    for (const item of items ?? []) {
      const extras = item.extras as Record<string, unknown> | undefined
      stripFmlRefid(extras)
      stripPlgFmlExtraKeys(extras)
    }
  }
  const stripSurfaces = (surfaces: FloorPlan['floors'][number]['surfaces'] | undefined) => {
    for (const surface of surfaces ?? []) {
      stripPlgFmlExtraKeys(surface.extras as Record<string, unknown> | undefined)
    }
  }
  for (const floor of cloned.floors ?? []) {
    stripWalls(floor.walls)
    stripItems(floor.items)
    stripSurfaces(floor.surfaces)
    for (const design of floor.designs ?? []) {
      stripWalls(design.walls)
      stripItems(design.items)
      stripSurfaces(design.surfaces)
      if (design.source?.settings) {
        stripPlgFmlExtraKeys(design.source.settings as Record<string, unknown>)
      }
    }
  }
  return cloned
}

/**
 * Schrijf een `.plg`-document met deterministische key-ordening
 * (expliciete header/settings-volgorde; `plan`/`foreign.fml` diep gesorteerd).
 */
export function writePlg(doc: PlgDocument): string {
  const payload: Record<string, unknown> = {
    format: PLG_FORMAT,
    version: doc.version,
    generator: doc.generator,
    savedAt: doc.savedAt,
    project: orderProject(doc.project),
    settings: orderSettings(doc.settings),
    plan: stripSessionOnlyFromPlan(doc.plan),
  }
  if (doc.foreign !== undefined) {
    payload.foreign = orderForeign(doc.foreign)
  }
  return JSON.stringify(pickOrdered(payload, DOCUMENT_KEYS), null, 2)
}

/** Bouw een geldig huidige-versie document (download / IDB-planhelft). */
export function createPlgDocument(input: {
  project: PlgProjectMeta
  settings: PlgSettings
  plan: FloorPlan
  foreign?: PlgForeign
  generator?: string
  savedAt?: string
}): PlgDocument {
  const doc: PlgDocument = {
    format: PLG_FORMAT,
    version: CURRENT_PLG_VERSION,
    generator: input.generator ?? DEFAULT_PLG_GENERATOR,
    savedAt: input.savedAt ?? new Date().toISOString(),
    project: input.project,
    settings: input.settings,
    plan: input.plan,
  }
  if (input.foreign !== undefined) {
    doc.foreign = input.foreign
  }
  return doc
}
