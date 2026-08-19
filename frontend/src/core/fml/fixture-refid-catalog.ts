import catalogData from './data/fixture-refid-catalog.json'

/**
 * Asset-kind voor FML-preview van items/fixtures (keuken/sanitair/installaties).
 * Bron: ./data/fixture-refid-catalog.json
 * Onbekende refid → generic box.
 */
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
  refid: string
  type?: string
  benaming?: string
  benaming_large?: string
  kind?: string
  kind_large?: string
  kind_large_min_cm?: number
  categorie?: string
  notities?: string
  fill?: string
  stroke?: string
}

const entries = (catalogData.entries ?? []) as CatalogEntry[]
const byRefid = new Map(entries.map((entry) => [entry.refid, entry]))

function inferKind(entry: CatalogEntry | undefined): FixtureAssetKind {
  const k = (entry?.kind ?? '').trim().toLowerCase() as FixtureAssetKind
  return KNOWN_KINDS.has(k) ? k : 'generic'
}

export interface FixtureCatalogInfo {
  refid: string
  label: string
  kind: FixtureAssetKind
  categorie: string
  fill?: string
  stroke?: string
}

export function resolveFixtureCatalog(
  refid: string,
  sizeCm?: { width: number; height: number },
): FixtureCatalogInfo {
  const entry = byRefid.get(refid)
  let kind = inferKind(entry)
  let label = entry?.benaming?.trim() || 'Object'
  const largeKind = (entry?.kind_large ?? '').trim()
  const largeMin = entry?.kind_large_min_cm
  if (sizeCm && largeKind && largeMin != null) {
    const span = Math.max(sizeCm.width, sizeCm.height)
    if (span >= largeMin) {
      kind = inferKind({ ...(entry ?? { refid }), kind: largeKind })
      label = entry?.benaming_large?.trim() || label
    }
  }
  const categorie = entry?.categorie?.trim() || 'overig'
  return {
    refid,
    label,
    kind,
    categorie,
    fill: entry?.fill?.trim() || undefined,
    stroke: entry?.stroke?.trim() || undefined,
  }
}

export interface FixturePlaceOption {
  refid: string
  label: string
  kind: FixtureAssetKind
  categorie: string
}

/** Unique (categorie, kind, label) rows for the place palette. */
export function listFixturePlaceOptions(): FixturePlaceOption[] {
  const seen = new Set<string>()
  const out: FixturePlaceOption[] = []
  for (const entry of entries) {
    const kind = inferKind(entry)
    if (kind === 'hidden') continue
    const label = entry.benaming?.trim() || 'Object'
    const categorie = entry.categorie?.trim() || 'overig'
    const key = `${categorie}|${kind}|${label}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ refid: entry.refid, label, kind, categorie })
  }
  return out
}

/** Mooiland oil bottle — Floorplanner-uitlijningsanker. */
export const FML_ALIGN_FIXTURE_REFID = '4e58355312c1de13eb2b1b29b4dfbf0a8dbabefd'
