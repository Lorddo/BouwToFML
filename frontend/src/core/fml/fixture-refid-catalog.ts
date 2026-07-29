import catalogData from '../../../../examples/fixture-refid-catalog.json'

/**
 * Asset-kind voor FML-preview van items/fixtures (keuken/sanitair/installaties).
 * Bron: examples/fixture-refid-catalog.json
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
  | 'generic'

interface CatalogEntry {
  refid: string
  type?: string
  benaming?: string
  kind?: string
  categorie?: string
  notities?: string
}

const entries = (catalogData.entries ?? []) as CatalogEntry[]
const byRefid = new Map(entries.map((entry) => [entry.refid, entry]))

function inferKind(entry: CatalogEntry | undefined): FixtureAssetKind {
  const k = (entry?.kind ?? '').trim().toLowerCase()
  if (
    k === 'countertop' ||
    k === 'toilet' ||
    k === 'sink_small' ||
    k === 'shower_head' ||
    k === 'sink_large' ||
    k === 'boiler' ||
    k === 'heat_pump'
  ) {
    return k
  }
  return 'generic'
}

export interface FixtureCatalogInfo {
  refid: string
  label: string
  kind: FixtureAssetKind
  categorie: string
}

export function resolveFixtureCatalog(refid: string): FixtureCatalogInfo {
  const entry = byRefid.get(refid)
  const kind = inferKind(entry)
  const label = entry?.benaming?.trim() || 'Object'
  const categorie = entry?.categorie?.trim() || 'overig'
  return { refid, label, kind, categorie }
}
