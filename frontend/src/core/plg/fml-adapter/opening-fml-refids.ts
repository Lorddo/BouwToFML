/**
 * FML-adapter mapping: OpeningKind ↔ Floorplanner refid.
 * Alleen voor import/export — niet op het domein.
 */
import mappingData from './opening-fml-refids.json'
import {
  defaultOpeningKind,
  isOpeningKind,
  unmappedOpeningKind,
  type OpeningKind,
} from '../../plan/opening-kind-catalog'
import type { OpeningType } from '../../plan/types'

interface MappingEntry {
  kind: string
  canonical: string
  aliases?: string[]
}

const entries = (mappingData.entries ?? []) as MappingEntry[]

const kindToCanonical = new Map<string, string>()
const refidToKind = new Map<string, OpeningKind>()

for (const entry of entries) {
  if (!isOpeningKind(entry.kind)) continue
  kindToCanonical.set(entry.kind, entry.canonical)
  refidToKind.set(entry.canonical, entry.kind)
  for (const alias of entry.aliases ?? []) {
    if (!refidToKind.has(alias)) refidToKind.set(alias, entry.kind)
  }
}

export function fmlRefidForOpeningKind(kind: OpeningKind): string {
  const canonical = kindToCanonical.get(kind)
  if (canonical) return canonical
  return kindToCanonical.get(defaultOpeningKind(kind.startsWith('window.') ? 'window' : 'door'))!
}

export function openingKindFromFmlRefid(
  refid: string | undefined | null,
  typeHint?: OpeningType,
): { kind: OpeningKind; known: boolean } {
  const key = (refid ?? '').trim()
  if (key) {
    const mapped = refidToKind.get(key)
    if (mapped) return { kind: mapped, known: true }
  }
  return { kind: unmappedOpeningKind(typeHint ?? 'door'), known: false }
}

/** True when this Floorplanner hash is known as a window kind. */
export function isKnownWindowFmlRefid(refid: string | undefined | null): boolean {
  const key = (refid ?? '').trim()
  if (!key) return false
  const kind = refidToKind.get(key)
  return !!kind && kind.startsWith('window.')
}

export function isKnownDoorFmlRefid(refid: string | undefined | null): boolean {
  const key = (refid ?? '').trim()
  if (!key) return false
  const kind = refidToKind.get(key)
  return !!kind && kind.startsWith('door.')
}
