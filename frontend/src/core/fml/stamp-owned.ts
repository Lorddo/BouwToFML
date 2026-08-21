/**
 * Session-only: inject-stempelmuur (workspace stap 4).
 * Overleeft sanitize-split/cover via extras-copy; niet naar Floorplanner exporteren.
 */
import type { Wall } from './types'

export const STAMP_OWNED_EXTRA = 'stampOwned' as const

export function isStampOwnedWall(wall: Pick<Wall, 'extras'> | null | undefined): boolean {
  return wall?.extras?.[STAMP_OWNED_EXTRA] === true
}

/** Zet/clear de vlag; andere extras blijven. */
export function markStampOwned(wall: Wall, owned = true): Wall {
  const extras = { ...(wall.extras ?? {}) }
  if (owned) {
    extras[STAMP_OWNED_EXTRA] = true
  } else {
    delete extras[STAMP_OWNED_EXTRA]
  }
  return {
    ...wall,
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  }
}

/** Strip vóór FML-export (niet in Floorplanner lekken). */
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
