import type { Opening } from './types'

/** Lokale opening-id (één floor): `{wallId}-door|window-{id|index}`. */
export function buildLocalOpeningId(
  wallId: string,
  opening: Opening,
  openingIndex: number,
): string {
  return opening.type === 'window'
    ? `${wallId}-window-${opening.id || openingIndex}`
    : `${wallId}-door-${opening.id || openingIndex}`
}

export function decodePlanOpeningId(openingId: string): {
  floorIndex: number | null
  localId: string
} {
  const match = /^(\d+):/.exec(openingId)
  if (!match) return { floorIndex: null, localId: openingId }
  return { floorIndex: Number(match[1]), localId: openingId.slice(match[0].length) }
}

export function encodePlanOpeningId(floorIndex: number, localId: string): string {
  return `${floorIndex}:${localId}`
}

/** Uniek over floors: zelfde muur-id + opening-id bij gestapelde gevels. */
export function scopeOpeningId(floorIndex: number, localId: string): string {
  return encodePlanOpeningId(floorIndex, localId)
}
