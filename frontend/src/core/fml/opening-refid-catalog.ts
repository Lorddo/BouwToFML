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
  | 'closet45'
export type WindowAssetKind = 'single' | 'multi' | 'round' | 'half_round'
export type OpeningAssetKind = DoorAssetKind | WindowAssetKind

/** CV/detectie-kinds: alle schuifvarianten vallen onder `sliding`. */
export type DoorResolvedKindCompat = 'single' | 'double_wide' | 'sliding' | 'passage' | 'closet45'

interface CatalogEntry {
  refid: string
  type: 'door' | 'window'
  benaming?: string
  subtype?: string
  kind?: string
  /** Kozijn-inset per zijde (cm) voor FML-boog/blad; gap blijft volle opening.width. */
  swingInsetCm?: number
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
  if (k === 'passage' || k === 'opening') return 'passage'

  const sub = `${entry?.subtype ?? ''} ${entry?.benaming ?? ''}`.toLowerCase()
  if (sub.includes('pocket')) return 'sliding_pocket'
  if (sub.includes('schuif_enkel') || sub.includes('1 schuivend')) return 'sliding_single'
  if (sub.includes('garage')) return 'garage'
  if (sub.includes('schuif') || sub.includes('pui')) return 'sliding'
  if (sub.includes('opening') || sub.includes('passage')) return 'passage'
  if (sub.includes('kast') || sub.includes('boog_45') || sub.includes('closet')) return 'closet45'
  if (sub.includes('dubbel')) return 'double_wide'
  return 'single'
}

function inferWindowKind(entry: CatalogEntry | undefined): WindowAssetKind {
  const k = (entry?.kind ?? '').trim().toLowerCase()
  if (k === 'round' || k === 'rond') return 'round'
  if (k === 'half_round' || k === 'half_rond' || k === 'halfrond') return 'half_round'
  if (k === 'multi' || k === 'dubbel' || k === 'driedelig' || k === 'meerdelig') return 'multi'
  if (k === 'single' || k === 'enkel') return 'single'

  const sub = `${entry?.subtype ?? ''} ${entry?.benaming ?? ''}`.toLowerCase()
  if (sub.includes('half_rond') || sub.includes('halfrond') || sub.includes('half-rond')) {
    return 'half_round'
  }
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
  if (kind === 'single' || kind === 'round' || kind === 'half_round') return 1
  return undefined
}

function defaultLabel(kind: OpeningAssetKind, type: OpeningType): string {
  if (type === 'window') {
    if (kind === 'multi') return 'Raam (meerdelig)'
    if (kind === 'round') return 'Raam rond'
    if (kind === 'half_round') return 'Raam half-rond'
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
      return 'Opening'
    case 'closet45':
      return 'Kastdeur'
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

export interface OpeningCatalogInfo {
  refid: string
  type: OpeningType
  label: string
  kind: OpeningAssetKind
  /**
   * FML-viewer alleen: kozijn-inset per zijde (cm).
   * Gap = volle `opening.width`; boog/blad = width − 2×swingInsetCm, gecentreerd.
   * Ramen / non-swing: 0.
   */
  swingInsetCm: number
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
  return 'single'
}

export function resolveOpeningCatalog(refid: string, type: OpeningType): OpeningCatalogInfo {
  const entry = byRefid.get(refid)
  const kind: OpeningAssetKind = type === 'door' ? inferDoorKind(entry) : inferWindowKind(entry)
  const label = entry?.benaming?.trim() || defaultLabel(kind, type)
  const swingInsetCm = type === 'door' ? resolveSwingInsetCm(entry, kind as DoorAssetKind) : 0
  const panels = type === 'window' ? inferPanels(entry, kind as WindowAssetKind) : undefined
  return { refid, type, label, kind, swingInsetCm, panels }
}
