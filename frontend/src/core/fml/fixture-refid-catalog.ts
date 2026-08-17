import catalogData from './data/fixture-refid-catalog.json'

/**
 * Asset-kind voor FML-preview van items/fixtures (keuken/sanitair/installaties).
 * Bron: ./data/fixture-refid-catalog.json
 * Onbekende refid → generic box.
 */
export type FixtureAssetKind =
  | 'countertop'
  | 'toilet'
  | 'sink_small'
  | 'shower_head'
  | 'sink_large'
  | 'boiler'
  | 'heat_pump'
  | 'stair_winder_180'
  | 'stair_quarter_90'
  | 'stair_quarter_90_up'
  | 'canopy'
  | 'chimney'
  | 'railing'
  | 'skylight'
  | 'roof_eave'
  | 'hidden'
  | 'oil_bottle'
  | 'generic'

const KNOWN_KINDS = new Set<FixtureAssetKind>([
  'countertop',
  'toilet',
  'sink_small',
  'shower_head',
  'sink_large',
  'boiler',
  'heat_pump',
  'stair_winder_180',
  'stair_quarter_90',
  'stair_quarter_90_up',
  'canopy',
  'chimney',
  'railing',
  'skylight',
  'roof_eave',
  'hidden',
  'oil_bottle',
  'generic',
])

interface CatalogEntry {
  refid: string
  type?: string
  benaming?: string
  kind?: string
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

export function resolveFixtureCatalog(refid: string): FixtureCatalogInfo {
  const entry = byRefid.get(refid)
  const kind = inferKind(entry)
  const label = entry?.benaming?.trim() || 'Object'
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

/** Mooiland oil bottle — Floorplanner-uitlijningsanker. */
export const FML_ALIGN_FIXTURE_REFID = '4e58355312c1de13eb2b1b29b4dfbf0a8dbabefd'
