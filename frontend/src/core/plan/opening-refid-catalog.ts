/**
 * @deprecated Importeer uit `opening-kind-catalog` (domein) of `plg/fml-adapter/opening-fml-refids` (hashes).
 * Compat-shim: `resolveOpeningCatalog` accepteert OpeningKind óf legacy refid; `info.kind` = glyph.
 */
import {
  resolveOpeningCatalogLegacyGlyph,
  resolveOpeningKind,
  type LegacyOpeningCatalogInfo,
  type OpeningKind,
} from './opening-kind-catalog'
import type { OpeningType } from './types'
import { openingKindFromFmlRefid } from '../plg/fml-adapter/opening-fml-refids'

export type {
  DoorAssetKind,
  DoorResolvedKindCompat,
  LegacyOpeningCatalogInfo,
  OpeningAssetKind,
  OpeningCatalogInfo,
  OpeningFrameCm,
  OpeningKind,
  OpeningLeafKind,
  WindowAssetKind,
} from './opening-kind-catalog'

export {
  defaultOpeningFrame,
  defaultOpeningKind,
  isOpeningKind,
  openingTypeFromKind,
  resolveOpeningKind,
  resolveWindowPanelCount,
  toCvDoorKind,
  unmappedOpeningKind,
} from './opening-kind-catalog'

/**
 * Legacy lookup. Prefer `resolveOpeningKind(opening.kind)`.
 * Returns catalog info with `kind` = **glyph** (oude semantiek voor glyphs).
 */
export function resolveOpeningCatalog(
  kindOrRefid: string,
  type: OpeningType,
): LegacyOpeningCatalogInfo {
  const raw = (kindOrRefid ?? '').trim()
  let openingKind: OpeningKind
  if (!raw) {
    openingKind = type === 'window' ? 'window.single' : 'door.single'
  } else if (raw.includes('.')) {
    openingKind = resolveOpeningKind(raw).kind
  } else {
    openingKind = openingKindFromFmlRefid(raw, type).kind
  }
  return resolveOpeningCatalogLegacyGlyph(openingKind)
}
