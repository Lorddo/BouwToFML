import type { DoorSizeBandPx } from './types'

/** Absolute minimum openingbreedte langs de muur (niet de draaidiepte). */
const DOOR_MIN_MM = 250
const DOOR_MAX_MM = 1200

function mmToPx(mm: number, ppm: number): number {
  return Math.max(1, Math.round(mm * Math.max(0, ppm)))
}

/**
 * Size-band voor de muur/opening-as alleen.
 * Diepte van de draaiboog komt runtime uit de deur-ref (± relax), niet hier.
 * ppm: mid van X/Y zodat één muur-band volstaat (H/V-oriëntatie via swap in de filter).
 */
export function resolveDoorSizeBandPx(ppmX: number, ppmY: number): DoorSizeBandPx {
  const ppm = Math.max(0, (Math.max(0, ppmX) + Math.max(0, ppmY)) / 2)
  return {
    wallMinPx: mmToPx(DOOR_MIN_MM, ppm),
    wallMaxPx: mmToPx(DOOR_MAX_MM, ppm),
  }
}
