import catalogData from './data/opening-refid-catalog.json'
import type { OpeningType } from './types'

/**
 * Asset-kind dat de FML-preview gebruikt om het 2D-symbool te kiezen.
 * Geometrie (scharnier/zwaaizijde) komt uit `mirrored` + muur a→b.
 * Kozijn-simulatie (boog vs gap) komt uit `swingInsetCm` in de catalogus —
 * plattegrond-onafhankelijk, niet uit gemeten ref-framing.
 *
 * Bron: ./data/opening-refid-catalog.json
 * Onbekende refid → default 'single' + swing_inset_defaults.single.
 */
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
  | 'bifold'
  | 'bifold_double'
export type WindowAssetKind = 'single' | 'multi' | 'round' | 'half_round' | 'triangle'
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

interface CatalogEntry {
  refid: string
  type: 'door' | 'window'
  benaming?: string
  subtype?: string
  kind?: string
  /** Kozijn-inset per zijde (cm) voor FML-boog/blad; gap blijft volle opening.width. */
  swingInsetCm?: number
  /** Optioneel kozijn (display); ontbreekt → kind-default. */
  frame?: Partial<OpeningFrameCm>
  /** Blad/glas in aanzicht. */
  leaf?: string
  views?: { plan?: string; elevation?: string }
  /** Vaste paneel-telling voor ramen (1|2|3); anders breedte-heuristiek bij multi. */
  panels?: number
}

type SwingInsetDefaults = Partial<Record<DoorAssetKind, number>>

const entries = (catalogData.entries ?? []) as CatalogEntry[]
const byRefid = new Map(entries.map((entry) => [entry.refid, entry]))
const swingInsetDefaults =
  (catalogData as { swing_inset_defaults?: SwingInsetDefaults }).swing_inset_defaults ?? {}

const DEFAULT_SWING_INSET_CM: Record<DoorAssetKind, number> = {
  single: 5,
  closet45: 5,
  double_wide: 5,
  sliding: 0,
  sliding_pocket: 0,
  sliding_single: 0,
  garage: 0,
  passage: 0,
  archway: 0,
  french_balcony: 5,
  bifold: 5,
  bifold_double: 5,
}

function inferDoorKind(entry: CatalogEntry | undefined): DoorAssetKind {
  const k = (entry?.kind ?? '').trim().toLowerCase()
  if (k === 'single' || k === 'enkel') return 'single'
  if (k === 'closet45' || k === 'closet' || k === 'kast') return 'closet45'
  if (k === 'double_wide' || k === 'dubbel_wide' || k === 'dubbel') return 'double_wide'
  if (k === 'sliding_pocket' || k === 'pocket') return 'sliding_pocket'
  if (k === 'sliding_single' || k === 'schuif_enkel') return 'sliding_single'
  if (k === 'sliding' || k === 'schuif' || k === 'schuifpui') return 'sliding'
  if (k === 'garage' || k === 'garagedeur') return 'garage'
  if (k === 'archway' || k === 'boog' || k === 'arch') return 'archway'
  if (k === 'passage' || k === 'opening') return 'passage'
  if (k === 'french_balcony' || k === 'fransbalkon' || k === 'french') return 'french_balcony'
  if (k === 'bifold_double' || k === 'vouw_dubbel') return 'bifold_double'
  if (k === 'bifold' || k === 'vouw' || k === 'vouwdeur') return 'bifold'

  const sub = `${entry?.subtype ?? ''} ${entry?.benaming ?? ''}`.toLowerCase()
  if (sub.includes('frans') || sub.includes('french_balcony')) return 'french_balcony'
  if (sub.includes('bifold_double') || (sub.includes('vouw') && sub.includes('dubbel'))) {
    return 'bifold_double'
  }
  if (sub.includes('bifold') || sub.includes('vouw')) return 'bifold'
  if (sub.includes('pocket')) return 'sliding_pocket'
  if (sub.includes('schuif_enkel') || sub.includes('1 schuivend')) return 'sliding_single'
  if (sub.includes('garage')) return 'garage'
  if (sub.includes('schuif') || sub.includes('pui')) return 'sliding'
  if (sub.includes('archway') || sub.includes('boogopening')) return 'archway'
  if (sub.includes('opening') || sub.includes('passage')) return 'passage'
  if (sub.includes('kast') || sub.includes('boog_45') || sub.includes('closet')) return 'closet45'
  if (sub.includes('dubbel')) return 'double_wide'
  return 'single'
}

function inferWindowKind(entry: CatalogEntry | undefined): WindowAssetKind {
  const k = (entry?.kind ?? '').trim().toLowerCase()
  if (k === 'round' || k === 'rond') return 'round'
  if (k === 'half_round' || k === 'half_rond' || k === 'halfrond') return 'half_round'
  if (k === 'triangle' || k === 'driehoek') return 'triangle'
  if (k === 'multi' || k === 'dubbel' || k === 'driedelig' || k === 'meerdelig') return 'multi'
  if (k === 'single' || k === 'enkel') return 'single'

  const sub = `${entry?.subtype ?? ''} ${entry?.benaming ?? ''}`.toLowerCase()
  if (sub.includes('half_rond') || sub.includes('halfrond') || sub.includes('half-rond')) {
    return 'half_round'
  }
  if (sub.includes('driehoek') || sub.includes('triangle')) return 'triangle'
  if (sub.includes('rond')) return 'round'
  if (sub.includes('dubbel') || sub.includes('driedelig') || sub.includes('meerdelig'))
    return 'multi'
  return 'single'
}

function inferPanels(
  entry: CatalogEntry | undefined,
  kind: WindowAssetKind,
): 1 | 2 | 3 | undefined {
  const raw = entry?.panels
  if (raw === 1 || raw === 2 || raw === 3) return raw
  if (kind === 'single' || kind === 'round' || kind === 'half_round' || kind === 'triangle') {
    return 1
  }
  return undefined
}

function defaultLabel(kind: OpeningAssetKind, type: OpeningType): string {
  if (type === 'window') {
    if (kind === 'multi') return 'Raam (meerdelig)'
    if (kind === 'round') return 'Raam rond'
    if (kind === 'half_round') return 'Raam half-rond'
    if (kind === 'triangle') return 'Raam driehoek'
    return 'Raam'
  }
  switch (kind) {
    case 'double_wide':
      return 'Dubbele deur'
    case 'sliding':
      return 'Schuifpui (2 schuivend)'
    case 'sliding_single':
      return 'Schuifpui (1 schuivend)'
    case 'sliding_pocket':
      return 'Pocketdeur'
    case 'garage':
      return 'Garagedeur'
    case 'passage':
      return 'Doorgang'
    case 'archway':
      return 'Doorgang (boog)'
    case 'closet45':
      return 'Kastdeur'
    case 'french_balcony':
      return 'Frans balkon'
    case 'bifold':
      return 'Vouwdeur (2-delig)'
    case 'bifold_double':
      return 'Vouwdeur (4-delig)'
    default:
      return 'Deur'
  }
}

function resolveSwingInsetCm(entry: CatalogEntry | undefined, kind: DoorAssetKind): number {
  if (typeof entry?.swingInsetCm === 'number' && Number.isFinite(entry.swingInsetCm)) {
    return Math.max(0, entry.swingInsetCm)
  }
  const fromDefaults = swingInsetDefaults[kind]
  if (typeof fromDefaults === 'number' && Number.isFinite(fromDefaults)) {
    return Math.max(0, fromDefaults)
  }
  return DEFAULT_SWING_INSET_CM[kind]
}

function finiteCm(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

/** Kind-defaults: deuren dorpel 0; passage 0; schuif wél 5 cm; ramen 5 rondom. */
export function defaultOpeningFrame(type: OpeningType, kind: OpeningAssetKind): OpeningFrameCm {
  if (type === 'window') {
    return { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 5 }
  }
  if (kind === 'passage' || kind === 'archway') {
    return { leftCm: 0, rightCm: 0, topCm: 0, bottomCm: 0 }
  }
  return { leftCm: 5, rightCm: 5, topCm: 5, bottomCm: 0 }
}

function resolveFrame(
  entry: CatalogEntry | undefined,
  type: OpeningType,
  kind: OpeningAssetKind,
): OpeningFrameCm {
  const base = defaultOpeningFrame(type, kind)
  const raw = entry?.frame
  if (!raw) return base
  return {
    leftCm: finiteCm(raw.leftCm, base.leftCm),
    rightCm: finiteCm(raw.rightCm, base.rightCm),
    topCm: finiteCm(raw.topCm, base.topCm),
    bottomCm: finiteCm(raw.bottomCm, base.bottomCm),
  }
}

function inferLeaf(
  entry: CatalogEntry | undefined,
  type: OpeningType,
  kind: OpeningAssetKind,
): OpeningLeafKind {
  const raw = (entry?.leaf ?? '').trim().toLowerCase()
  if (raw === 'glass' || raw === 'glas') return 'glass'
  if (raw === 'solid' || raw === 'vol') return 'solid'
  if (raw === 'paneled' || raw === 'paneel') return 'paneled'
  if (type === 'window') return 'glass'
  if (kind === 'garage') return 'paneled'
  if (kind === 'sliding_pocket') return 'solid'
  if (kind === 'sliding' || kind === 'sliding_single') return 'glass'
  if (kind === 'double_wide') {
    const sub = `${entry?.subtype ?? ''} ${entry?.benaming ?? ''}`.toLowerCase()
    if (sub.includes('glas')) return 'glass'
    return 'solid'
  }
  return 'solid'
}

export interface OpeningCatalogInfo {
  refid: string
  type: OpeningType
  label: string
  kind: OpeningAssetKind
  /**
   * FML-viewer alleen: kozijn-inset per zijde (cm) voor boog/blad.
   * Gap = volle `opening.width`. Ramen / non-swing: 0.
   * Alias van frame L/R voor draaideuren; schuif blijft 0 (pijlen volle gap).
   */
  swingInsetCm: number
  /** Display-kozijn (in het FML-gat); schaalbaar via extras.btfFrame. */
  frame: OpeningFrameCm
  leaf: OpeningLeafKind
  elevationSymbol: string
  planSymbol: string
  /** Vaste paneel-telling voor ramen wanneer bekend in de catalogus. */
  panels?: 1 | 2 | 3
}

/** Map preview-kinds naar CV-compatibele deurkinds (schuifvarianten → sliding). */
export function toCvDoorKind(kind: OpeningAssetKind): DoorResolvedKindCompat {
  if (
    kind === 'sliding_pocket' ||
    kind === 'sliding_single' ||
    kind === 'sliding' ||
    kind === 'garage'
  ) {
    return 'sliding'
  }
  if (kind === 'double_wide' || kind === 'passage' || kind === 'closet45' || kind === 'single') {
    return kind
  }
  if (kind === 'archway') return 'passage'
  if (kind === 'french_balcony' || kind === 'bifold' || kind === 'bifold_double') return 'single'
  return 'single'
}

/** Paneel-telling voor raam-glyphs (plan + aanzicht). */
export function resolveWindowPanelCount(
  widthCm: number,
  kind: OpeningAssetKind | WindowAssetKind,
  panels?: 1 | 2 | 3,
): 1 | 2 | 3 {
  if (kind === 'round' || kind === 'half_round' || kind === 'triangle') return 1
  if (panels === 1 || panels === 2 || panels === 3) return panels
  if (kind !== 'multi') return 1
  if (widthCm >= 220) return 3
  if (widthCm >= 140) return 2
  return 1
}

export function resolveOpeningCatalog(refid: string, type: OpeningType): OpeningCatalogInfo {
  const entry = byRefid.get(refid)
  const kind: OpeningAssetKind = type === 'door' ? inferDoorKind(entry) : inferWindowKind(entry)
  const label = entry?.benaming?.trim() || defaultLabel(kind, type)
  const swingInsetCm = type === 'door' ? resolveSwingInsetCm(entry, kind as DoorAssetKind) : 0
  const panels = type === 'window' ? inferPanels(entry, kind as WindowAssetKind) : undefined
  const frame = resolveFrame(entry, type, kind)
  const leaf = inferLeaf(entry, type, kind)
  const elevationSymbol = entry?.views?.elevation?.trim() || kind
  const planSymbol = entry?.views?.plan?.trim() || kind
  return {
    refid,
    type,
    label,
    kind,
    swingInsetCm,
    frame,
    leaf,
    elevationSymbol,
    planSymbol,
    panels,
  }
}
