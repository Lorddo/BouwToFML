/**
 * FML-adapter mapping: FixtureAssetKind ↔ Floorplanner refid.
 */
import mappingData from './fixture-fml-refids.json'
import {
  isFixtureAssetKind,
  type FixtureAssetKind,
} from '../../plan/fixture-kind-catalog'

interface SizeUpgrade {
  kind: string
  minCm: number
  label?: string
}

interface MappingEntry {
  kind: string
  canonical: string
  aliases?: string[]
  sizeUpgradeByRefid?: Record<string, SizeUpgrade>
}

const entries = (mappingData.entries ?? []) as MappingEntry[]
const alignKindRaw = (mappingData as { alignKind?: string }).alignKind ?? 'oil_bottle'

const kindToCanonical = new Map<string, string>()
const refidToKind = new Map<string, FixtureAssetKind>()
const refidSizeUpgrade = new Map<string, SizeUpgrade>()

for (const entry of entries) {
  if (!isFixtureAssetKind(entry.kind)) continue
  kindToCanonical.set(entry.kind, entry.canonical)
  refidToKind.set(entry.canonical, entry.kind)
  for (const alias of entry.aliases ?? []) {
    if (!refidToKind.has(alias)) refidToKind.set(alias, entry.kind)
  }
  for (const [refid, upgrade] of Object.entries(entry.sizeUpgradeByRefid ?? {})) {
    refidSizeUpgrade.set(refid, upgrade)
  }
}

export const FML_ALIGN_FIXTURE_KIND: FixtureAssetKind = isFixtureAssetKind(alignKindRaw)
  ? alignKindRaw
  : 'oil_bottle'

export function fmlRefidForFixtureKind(kind: FixtureAssetKind): string {
  return kindToCanonical.get(kind) ?? kindToCanonical.get('generic') ?? ''
}

export function fixtureKindFromFmlRefid(
  refid: string | undefined | null,
): { kind: FixtureAssetKind; known: boolean } {
  const key = (refid ?? '').trim()
  if (key) {
    const mapped = refidToKind.get(key)
    if (mapped) return { kind: mapped, known: true }
  }
  return { kind: 'generic', known: false }
}

/**
 * Sommige Floorplanner-refids delen een kind maar schakelen op maat (Kromme wasbak).
 * Alleen bij lookup via die hash — niet bij domein-`kind` alleen.
 */
export function fixtureSizeUpgradeFromFmlRefid(
  refid: string | undefined | null,
  sizeCm?: { width: number; height: number },
): { kind: FixtureAssetKind; label?: string } | null {
  const key = (refid ?? '').trim()
  if (!key || !sizeCm) return null
  const upgrade = refidSizeUpgrade.get(key)
  if (!upgrade) return null
  const span = Math.max(sizeCm.width, sizeCm.height)
  if (!(span >= upgrade.minCm)) return null
  if (!isFixtureAssetKind(upgrade.kind)) return null
  return { kind: upgrade.kind, label: upgrade.label }
}
