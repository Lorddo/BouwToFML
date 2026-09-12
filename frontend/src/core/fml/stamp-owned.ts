/**
 * Session-only: inject-stempelmuur (workspace stap 4).
 * Overleeft sanitize-split/cover via wall-spread (`stampOwned` op de Wall);
 * niet naar Floorplanner / `.plg` exporteren.
 */
import type { Wall } from './types'

/** @deprecated Legacy extras-key; alleen nog strip/fallback. */
export const STAMP_OWNED_EXTRA = 'stampOwned' as const

export function isStampOwnedWall(wall: Pick<Wall, 'extras'> | null | undefined): boolean {
  if (!wall) return false
  if (typeof wall === 'object' && 'stampOwned' in wall && (wall as Wall).stampOwned === true) {
    return true
  }
  return wall.extras?.[STAMP_OWNED_EXTRA] === true
}

/** Zet/clear de vlag; andere extras blijven; legacy extras-key wordt verwijderd. */
export function markStampOwned(wall: Wall, owned = true): Wall {
  const extras = { ...(wall.extras ?? {}) }
  delete extras[STAMP_OWNED_EXTRA]
  return {
    ...wall,
    stampOwned: owned ? true : undefined,
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
}

/** Strip legacy extras-key (no-op als de key al weg is). */
export function stripStampOwnedFromExtras(
  extras: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!extras || !(STAMP_OWNED_EXTRA in extras)) return extras
  const next = { ...extras }
  delete next[STAMP_OWNED_EXTRA]
  return Object.keys(next).length > 0 ? next : undefined
}

export function collectStampOwnedWallIds(walls: readonly Wall[]): string[] {
  return walls.filter(isStampOwnedWall).map((wall) => wall.id)
}
