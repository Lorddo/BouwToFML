/**
 * Domein opening-kinds (geen Floorplanner-hashes).
 * Glyph-families blijven afgeleid van `OpeningKind`.
 */
import catalogData from './data/opening-kinds.json'
import type { OpeningType } from './types'

export type DoorOpeningKind =
  | 'door.single'
  | 'door.closet'
  | 'door.passage'
  | 'door.archway'
  | 'door.round'
  | 'door.french_balcony'
  | 'door.balcony'
  | 'door.flush'
  | 'door.half_glass'
  | 'door.double'
  | 'door.double_solid'
  | 'door.bifold'
  | 'door.bifold_double'
  | 'door.pocket'
  | 'door.sliding_single'
  | 'door.sliding'
  | 'door.elevator'
  | 'door.garage'
  | 'door.unmapped'

export type WindowOpeningKind =
  | 'window.single'
  | 'window.grid'
  | 'window.double'
  | 'window.triple'
  | 'window.round'
  | 'window.half_round'
  | 'window.triangle'
  | 'window.blind'
  | 'window.unmapped'

export type OpeningKind = DoorOpeningKind | WindowOpeningKind

/** Glyph-families voor plattegrond/aanzicht (afgeleid van OpeningKind). */
export type DoorAssetKind =
  | 'single'
  | 'double_wide'
  | 'sliding'
  | 'sliding_pocket'
  | 'sliding_single'
  | 'garage'
  | 'passage'
  | 'archway'
  | 'closet45'
  | 'french_balcony'
  | 'flush'
  | 'half_glass'
  | 'bifold'
  | 'bifold_double'
  | 'elevator'
  | 'round_opening'

export type WindowAssetKind = 'single' | 'grid' | 'multi' | 'round' | 'half_round' | 'triangle'
export type OpeningAssetKind = DoorAssetKind | WindowAssetKind

/** CV/detectie-kinds: alle schuifvarianten vallen onder `sliding`. */
export type DoorResolvedKindCompat = 'single' | 'double_wide' | 'sliding' | 'passage' | 'closet45'

export type OpeningLeafKind = 'glass' | 'solid' | 'paneled'

export interface OpeningFrameCm {
  leftCm: number
  rightCm: number
  topCm: number
  bottomCm: number
}

interface KindEntry {
  kind: string
  type: 'door' | 'window'
  label: string
  glyph: string
  swingInsetCm?: number
  panels?: number
  leaf?: string
  frame?: Partial<OpeningFrameCm>
}

const entries = (catalogData.entries ?? []) as KindEntry[]
const byKind = new Map(entries.map((entry) => [entry.kind, entry]))

const ALL_OPENING_KINDS = new Set(entries.map((e) => e.kind))

export function isOpeningKind(value: string): value is OpeningKind {
  return ALL_OPENING_KINDS.has(value)
}

export function openingTypeFromKind(kind: OpeningKind): OpeningType {
  return kind.startsWith('window.') ? 'window' : 'door'
}

export function defaultOpeningKind(type: OpeningType): OpeningKind {
  return type === 'window' ? 'window.single' : 'door.single'
}

export function unmappedOpeningKind(type: OpeningType): OpeningKind {
  return type === 'window' ? 'window.unmapped' : 'door.unmapped'
}

function asDoorGlyph(raw: string): DoorAssetKind {
  const k = raw as DoorAssetKind
  const known: DoorAssetKind[] = [
    'single',
    'double_wide',
    'sliding',
    'sliding_pocket',
    'sliding_single',
    'garage',
    'passage',
    'archway',
    'closet45',
    'french_balcony',
    'flush',
    'half_glass',
    'bifold',
    'bifold_double',
    'elevator',
    'round_opening',
  ]
  return known.includes(k) ? k : 'single'
}

function asWindowGlyph(raw: string): WindowAssetKind {
  const k = raw as WindowAssetKind
  if (
    k === 'multi' ||
    k === 'round' ||
    k === 'half_round' ||
    k === 'triangle' ||
    k === 'single' ||
    k === 'grid'
  ) {
    return k
  }
  return 'single'
}

function glyphForKind(kind: OpeningKind, type: OpeningType): OpeningAssetKind {
  const entry = byKind.get(kind)
  const raw = (entry?.glyph ?? '').trim()
  if (type === 'window') return asWindowGlyph(raw || 'single')
  return asDoorGlyph(raw || 'single')
}

function finiteCm(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

/** Kind-defaults: deuren dorpel 0; passage 0; schuif wél 5 cm; ramen 5 rondom. */
export function defaultOpeningFrame(type: OpeningType, glyph: OpeningAssetKind): OpeningFrameCm {
  if (type === 'window') {
    return { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 }
  }
  if (glyph === 'passage' || glyph === 'archway' || glyph === 'round_opening') {
    return { leftCm: 0, rightCm: 0, topCm: 0, bottomCm: 0 }
  }
  return { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 }
}

function resolveFrame(
  entry: KindEntry | undefined,
  type: OpeningType,
  glyph: OpeningAssetKind,
): OpeningFrameCm {
  const base = defaultOpeningFrame(type, glyph)
  const raw = entry?.frame
  if (!raw) return base
  return {
    leftCm: finiteCm(raw.leftCm, base.leftCm),
    rightCm: finiteCm(raw.rightCm, base.rightCm),
    topCm: finiteCm(raw.topCm, base.topCm),
    bottomCm: finiteCm(raw.bottomCm, base.bottomCm),
  }
}

function inferLeaf(entry: KindEntry | undefined, type: OpeningType, glyph: OpeningAssetKind): OpeningLeafKind {
  const raw = (entry?.leaf ?? '').trim().toLowerCase()
  if (raw === 'glass' || raw === 'glas') return 'glass'
  if (raw === 'solid' || raw === 'vol') return 'solid'
  if (raw === 'paneled' || raw === 'paneel') return 'paneled'
  if (type === 'window') return 'glass'
  if (glyph === 'garage') return 'paneled'
  if (glyph === 'sliding_pocket') return 'solid'
  if (glyph === 'sliding' || glyph === 'sliding_single') return 'glass'
  return 'solid'
}

export interface OpeningCatalogInfo {
  kind: OpeningKind
  type: OpeningType
  label: string
  /** Glyph-family voor 2D-symbolen. */
  glyph: OpeningAssetKind
  swingInsetCm: number
  frame: OpeningFrameCm
  leaf: OpeningLeafKind
  elevationSymbol: string
  planSymbol: string
  panels?: 1 | 2 | 3
}

/** Map preview-glyphs naar CV-compatibele deurkinds (schuifvarianten → sliding). */
export function toCvDoorKind(glyph: OpeningAssetKind): DoorResolvedKindCompat {
  if (
    glyph === 'sliding_pocket' ||
    glyph === 'sliding_single' ||
    glyph === 'sliding' ||
    glyph === 'elevator' ||
    glyph === 'garage'
  ) {
    return 'sliding'
  }
  if (glyph === 'double_wide' || glyph === 'passage' || glyph === 'closet45' || glyph === 'single') {
    return glyph
  }
  if (glyph === 'archway' || glyph === 'round_opening') return 'passage'
  if (
    glyph === 'french_balcony' ||
    glyph === 'flush' ||
    glyph === 'half_glass' ||
    glyph === 'bifold' ||
    glyph === 'bifold_double'
  ) {
    return 'single'
  }
  return 'single'
}

/** Paneel-telling voor raam-glyphs (plan + aanzicht). */
export function resolveWindowPanelCount(
  widthCm: number,
  glyph: OpeningAssetKind | WindowAssetKind,
  panels?: 1 | 2 | 3,
): 1 | 2 | 3 {
  if (glyph === 'round' || glyph === 'half_round' || glyph === 'triangle') return 1
  if (panels === 1 || panels === 2 || panels === 3) return panels
  if (glyph !== 'multi') return 1
  if (widthCm >= 220) return 3
  if (widthCm >= 140) return 2
  return 1
}

export function resolveOpeningKind(kind: OpeningKind | string | undefined | null): OpeningCatalogInfo {
  const raw = typeof kind === 'string' ? kind.trim() : ''
  const resolved: OpeningKind = isOpeningKind(raw)
    ? raw
    : raw.startsWith('window.')
      ? 'window.unmapped'
      : 'door.unmapped'
  const type = openingTypeFromKind(resolved)
  const entry = byKind.get(resolved)
  const glyph = glyphForKind(resolved, type)
  const label = entry?.label?.trim() || (type === 'window' ? 'Raam' : 'Deur')
  const swingInsetCm =
    type === 'door' && typeof entry?.swingInsetCm === 'number' && Number.isFinite(entry.swingInsetCm)
      ? Math.max(0, entry.swingInsetCm)
      : type === 'door'
        ? 5
        : 0
  const panelsRaw = entry?.panels
  const panels =
    type === 'window' && (panelsRaw === 1 || panelsRaw === 2 || panelsRaw === 3)
      ? panelsRaw
      : undefined
  const frame = resolveFrame(entry, type, glyph)
  const leaf = inferLeaf(entry, type, glyph)
  return {
    kind: resolved,
    type,
    label,
    glyph,
    swingInsetCm,
    frame,
    leaf,
    elevationSymbol: glyph,
    planSymbol: glyph,
    panels,
  }
}

/**
 * @deprecated Gebruik `resolveOpeningKind` + `.glyph`.
 * Compat: `kind` = glyph-family (oude semantiek).
 */
export type LegacyOpeningCatalogInfo = Omit<OpeningCatalogInfo, 'kind'> & {
  kind: OpeningAssetKind
  openingKind: OpeningKind
}

export function resolveOpeningCatalogLegacyGlyph(
  openingKind: OpeningKind | string | undefined | null,
): LegacyOpeningCatalogInfo {
  const info = resolveOpeningKind(openingKind)
  return { ...info, openingKind: info.kind, kind: info.glyph }
}
