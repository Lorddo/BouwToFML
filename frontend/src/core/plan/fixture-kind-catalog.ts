/**
 * Domein fixture-kinds (geen Floorplanner-hashes).
 * Bron: ./data/fixture-kinds.json
 */
import catalogData from './data/fixture-kinds.json'

export type FixtureAssetKind =
  | 'countertop'
  | 'fridge'
  | 'cabinet_high'
  | 'kitchen_sink'
  | 'cooktop'
  | 'dishwasher'
  | 'washing_machine'
  | 'dryer'
  | 'washer_dryer'
  | 'bathtub'
  | 'sink_double'
  | 'toilet'
  | 'toilet_wall_hung'
  | 'sink_small'
  | 'shower_head'
  | 'sink_large'
  | 'sink_vanity'
  | 'glass_wall'
  | 'entrance_arrow'
  | 'north_cross'
  | 'fuse_box'
  | 'boiler'
  | 'heat_pump'
  | 'stair_winder_180'
  | 'stair_quarter_90'
  | 'stair_quarter_90_up'
  | 'stair_straight'
  | 'stair_straight_double'
  | 'stair_opening'
  | 'canopy'
  | 'chimney'
  | 'koof'
  | 'railing'
  | 'balustrade'
  | 'skylight'
  | 'roof_eave'
  | 'dormer'
  | 'hidden'
  | 'oil_bottle'
  | 'generic'

const KNOWN_KINDS = new Set<FixtureAssetKind>([
  'countertop',
  'fridge',
  'cabinet_high',
  'kitchen_sink',
  'cooktop',
  'dishwasher',
  'washing_machine',
  'dryer',
  'washer_dryer',
  'bathtub',
  'sink_double',
  'toilet',
  'toilet_wall_hung',
  'sink_small',
  'shower_head',
  'sink_large',
  'sink_vanity',
  'glass_wall',
  'entrance_arrow',
  'north_cross',
  'fuse_box',
  'boiler',
  'heat_pump',
  'stair_winder_180',
  'stair_quarter_90',
  'stair_quarter_90_up',
  'stair_straight',
  'stair_straight_double',
  'stair_opening',
  'canopy',
  'chimney',
  'koof',
  'railing',
  'balustrade',
  'skylight',
  'roof_eave',
  'dormer',
  'hidden',
  'oil_bottle',
  'generic',
])

interface CatalogEntry {
  kind: string
  label?: string
  labelLarge?: string
  kindLarge?: string
  kindLargeMinCm?: number
  categorie?: string
  fill?: string
  stroke?: string
}

const entries = (catalogData.entries ?? []) as CatalogEntry[]
const byKind = new Map(entries.map((entry) => [entry.kind, entry]))

export function isFixtureAssetKind(value: string): value is FixtureAssetKind {
  return KNOWN_KINDS.has(value as FixtureAssetKind)
}

function coerceKind(raw: string | undefined | null): FixtureAssetKind {
  const k = (raw ?? '').trim()
  return isFixtureAssetKind(k) ? k : 'generic'
}

export interface FixtureCatalogInfo {
  kind: FixtureAssetKind
  label: string
  categorie: string
  fill?: string
  stroke?: string
}

export function resolveFixtureKind(
  kind: string | undefined | null,
  sizeCm?: { width: number; height: number },
): FixtureCatalogInfo {
  let resolved = coerceKind(kind)
  const entry = byKind.get(resolved)
  let label = entry?.label?.trim() || 'Object'
  const largeKind = (entry?.kindLarge ?? '').trim()
  const largeMin = entry?.kindLargeMinCm
  if (sizeCm && largeKind && largeMin != null) {
    const span = Math.max(sizeCm.width, sizeCm.height)
    if (span >= largeMin) {
      resolved = coerceKind(largeKind)
      label = entry?.labelLarge?.trim() || label
    }
  }
  const categorie = entry?.categorie?.trim() || 'overig'
  return {
    kind: resolved,
    label,
    categorie,
    fill: entry?.fill?.trim() || undefined,
    stroke: entry?.stroke?.trim() || undefined,
  }
}

export interface FixturePlaceOption {
  kind: FixtureAssetKind
  label: string
  categorie: string
}

/** Unique (categorie, kind, label) rows for the place palette. */
export function listFixturePlaceOptions(): FixturePlaceOption[] {
  const seen = new Set<string>()
  const out: FixturePlaceOption[] = []
  for (const entry of entries) {
    const kind = coerceKind(entry.kind)
    if (kind === 'hidden' || kind === 'dormer') continue
    const label = entry.label?.trim() || 'Object'
    const categorie = entry.categorie?.trim() || 'overig'
    const key = `${categorie}|${kind}|${label}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, label, categorie })
  }
  return out
}
