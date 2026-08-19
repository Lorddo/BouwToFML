export type FmlInspectKind = 'wall' | 'door' | 'window' | 'area' | 'surface' | 'item'

export interface FmlInspectHit {
  kind: FmlInspectKind
  /** FML guid (area/surface/wall id, of opening.guid). */
  id: string
  floorIndex: number
  /** Alleen deur/raam. */
  wallId?: string
}

export const INSPECT_COLOR_OPEN = '#f59e0b'
export const INSPECT_COLOR_DONE = '#22c55e'

const HEX6 = /^#[0-9A-Fa-f]{6}$/

export function inspectColorFor(
  id: string,
  colors: Record<string, string> | undefined | null,
): string | undefined {
  const hex = colors?.[id]?.trim()
  if (hex && HEX6.test(hex)) return hex
  return undefined
}

export function resolveInspectFill(
  id: string,
  colors: Record<string, string> | undefined | null,
  fallback: string,
): string {
  return inspectColorFor(id, colors) ?? fallback
}

/** Demo-cycle: uit → open → klaar → uit. */
export function cycleInspectColor(current: string | undefined): string | undefined {
  if (!current) return INSPECT_COLOR_OPEN
  const n = current.trim().toLowerCase()
  if (n === INSPECT_COLOR_OPEN.toLowerCase()) return INSPECT_COLOR_DONE
  return undefined
}

export function inspectKindLabel(kind: FmlInspectKind): string {
  if (kind === 'wall') return 'Muur'
  if (kind === 'door') return 'Deur'
  if (kind === 'window') return 'Raam'
  if (kind === 'area') return 'Kamer'
  if (kind === 'item') return 'Object'
  return 'Vlak'
}

export interface InspectHitCandidates {
  opening: {
    compositeId: string
    guid: string
    type: 'door' | 'window'
    wallId: string
  } | null
  item?: { id: string } | null
  surface: { id: string; isCutout: boolean } | null
  area: { id: string } | null
  wall: { id: string } | null
}

export interface PickedInspectTarget {
  kind: FmlInspectKind
  id: string
  wallId?: string
  compositeOpeningId?: string
}

/**
 * Inspect-hit: opening → item → surface (geen cutout) → muur → kamer.
 * Muur vóór area zodat een rand-tik de muur pakt, niet de kamer erachter.
 *
 * F (bewust): edit-pick in `useFmlPreviewPointer` heeft een andere volgorde
 * (junction/opening/label/line/surface/area/wall) omdat edit tools andere
 * handles nodig hebben. Niet canonicaliseren zonder productbesluit.
 * Edit-hover RAF blijft junction/opening/wall-only (area/surface = inspect).
 */
export function pickInspectTarget(hits: InspectHitCandidates): PickedInspectTarget | null {
  if (hits.opening) {
    return {
      kind: hits.opening.type,
      id: hits.opening.guid,
      wallId: hits.opening.wallId,
      compositeOpeningId: hits.opening.compositeId,
    }
  }
  if (hits.item) {
    return { kind: 'item', id: hits.item.id }
  }
  if (hits.surface && !hits.surface.isCutout) {
    return { kind: 'surface', id: hits.surface.id }
  }
  if (hits.wall) {
    return { kind: 'wall', id: hits.wall.id }
  }
  if (hits.area) {
    return { kind: 'area', id: hits.area.id }
  }
  return null
}
