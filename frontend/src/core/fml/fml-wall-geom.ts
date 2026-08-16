import type { Point2D, Wall } from './types'

/**
 * Floorplanner-linkernormaal in FML-ruimte (Y omlaag, zoals het scherm).
 *
 * Sta op **a**, kijk naar **b**: links = `{ x: dir.y, y: -dir.x }`.
 * `balance` is de fractie van de dikte aan die linkerzijde
 * (`0` = alles rechts, `1` = alles links, `0.5` = gecentreerd).
 *
 * Zelfde a→b-afhankelijkheid als deuren (`mirrored`). Draai a↔b om, dan
 * wisselen links/rechts: dezelfde wereld-face vraagt `1 - balance`.
 *
 * De Y-omhoog-rotatie `{ x: -dy, y: dx }` is hier de **rechter** normaal
 * (zie `wallNormal` bij deur-swing) — die niet gebruiken voor balance.
 */
export function floorplannerLeftNormal(dir: Point2D): Point2D {
  return { x: dir.y, y: -dir.x }
}

/** Hartlijnlengte in cm (Floorplanner-ruimte). */
export function wallLengthCm(wall: Pick<Wall, 'a' | 'b'>): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
}

export function totalWallLengthCm(walls: Array<Pick<Wall, 'a' | 'b'>>): number {
  let total = 0
  for (const wall of walls) total += wallLengthCm(wall)
  return total
}
