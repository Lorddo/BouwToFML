/**
 * @deprecated Importeer uit `fixture-kind-catalog` (domein) of `plg/fml-adapter/fixture-fml-refids`.
 * Compat-shim: `resolveFixtureCatalog(refid|kind)` werkt met beide.
 */
import {
  isFixtureAssetKind,
  listFixturePlaceOptions,
  resolveFixtureKind,
  type FixtureAssetKind,
  type FixtureCatalogInfo,
  type FixturePlaceOption,
} from './fixture-kind-catalog'
import {
  FML_ALIGN_FIXTURE_KIND,
  fixtureKindFromFmlRefid,
  fixtureSizeUpgradeFromFmlRefid,
  fmlRefidForFixtureKind,
} from '../plg/fml-adapter/fixture-fml-refids'

export type { FixtureAssetKind, FixtureCatalogInfo, FixturePlaceOption }
export { listFixturePlaceOptions, resolveFixtureKind }

/** @deprecated Zoek op `kind === 'oil_bottle'`; FML-hash alleen in adapter. */
export const FML_ALIGN_FIXTURE_REFID = fmlRefidForFixtureKind(FML_ALIGN_FIXTURE_KIND)

export { FML_ALIGN_FIXTURE_KIND }

/** Legacy: refid of kind → catalog info. Prefer `resolveFixtureKind`. */
export function resolveFixtureCatalog(
  kindOrRefid: string,
  sizeCm?: { width: number; height: number },
): FixtureCatalogInfo {
  const raw = (kindOrRefid ?? '').trim()
  if (!raw) return resolveFixtureKind('generic', sizeCm)
  if (isFixtureAssetKind(raw)) {
    return resolveFixtureKind(raw, sizeCm)
  }
  const fromFml = fixtureKindFromFmlRefid(raw)
  if (fromFml.known) {
    const upgraded = fixtureSizeUpgradeFromFmlRefid(raw, sizeCm)
    if (upgraded) {
      const base = resolveFixtureKind(upgraded.kind, sizeCm)
      return upgraded.label ? { ...base, label: upgraded.label } : base
    }
    return resolveFixtureKind(fromFml.kind, sizeCm)
  }
  // Onbekende hash of string → generic (glyph-fallback).
  return resolveFixtureKind('generic', sizeCm)
}
