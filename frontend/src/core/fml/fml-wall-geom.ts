import type { Opening, Point2D, Wall } from './types'
import { FML_WALL_BALANCE_FALLBACK } from './extraction-to-plan-geom'

/**
 * Floorplanner-linkernormaal in FML-ruimte (Y omlaag, zoals het scherm).
 *
 * Sta op **a**, kijk naar **b**: links = `{ x: dir.y, y: -dir.x }`.
 * `balance` is de fractie van de dikte aan die linkerzijde van de **hartlijn**
 * `a`/`b` (`0` = alles rechts, `1` = alles links, `0.5` = gecentreerd).
 * Floorplanner staat waarden buiten 0–1 toe; render volgt dat (tot ±1000%).
 *
 * Zelfde a→b-afhankelijkheid als deuren (`mirrored`). Draai a↔b om, dan
 * wisselen links/rechts: dezelfde wereld-face vraagt `1 - balance`.
 *
 * De Y-omhoog-rotatie `{ x: -dy, y: dx }` is hier de **rechter** normaal
 * (zie `wallNormal` bij deur-swing) — die niet gebruiken voor balance.
 *
 * Belangrijk: `a`/`b` is de Floorplanner-hartlijn. Het lichaam schuift t.o.v.
 * die lijn; visueel midden = as + leftNormal × thickness × (balance − 0.5).
 */
export function floorplannerLeftNormal(dir: Point2D): Point2D {
  return { x: dir.y, y: -dir.x }
}

/** Hartlijnlengte / aslengte in cm (Floorplanner-ruimte). */
export function wallLengthCm(wall: Pick<Wall, 'a' | 'b'>): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
}

export function totalWallLengthCm(walls: Array<Pick<Wall, 'a' | 'b'>>): number {
  let total = 0
  for (const wall of walls) total += wallLengthCm(wall)
  return total
}

/** Veilige rail voor editor/import (Floorplanner 1000% / −250%). Detectie blijft 0–1. */
export const FML_WALL_BALANCE_ABS_MAX = 10

export function clampWallBalance(balance: number | undefined): number {
  if (!Number.isFinite(balance)) return FML_WALL_BALANCE_FALLBACK
  return Math.min(FML_WALL_BALANCE_ABS_MAX, Math.max(-FML_WALL_BALANCE_ABS_MAX, balance as number))
}

export function wallDirectionUnit(wall: Pick<Wall, 'a' | 'b'>): Point2D {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-12) return { x: 1, y: 0 }
  return { x: dx / len, y: dy / len }
}

/** Linkernormaal van a→b (unit). */
export function wallLeftNormal(wall: Pick<Wall, 'a' | 'b'>): Point2D {
  return floorplannerLeftNormal(wallDirectionUnit(wall))
}

export function resolveWallBalanceExtents(
  thickness: number,
  balance?: number,
): { plus: number; minus: number } {
  const b = clampWallBalance(balance)
  return {
    plus: thickness * b,
    minus: thickness * (1 - b),
  }
}

/** cm langs leftNormal van as → lichaam-midden (0 bij balance 0.5). */
export function wallBalanceMidOffsetCm(thickness: number, balance?: number): number {
  const { plus, minus } = resolveWallBalanceExtents(thickness, balance)
  return (plus - minus) / 2
}

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

function offsetPoint(point: Point2D, n: Point2D, dist: number): Point2D {
  return { x: point.x + n.x * dist, y: point.y + n.y * dist }
}

/** Punt op de as bij parameter t (0 = a, 1 = b). */
export function wallAxisPoint(wall: Pick<Wall, 'a' | 'b'>, t = 0.5): Point2D {
  return lerpPoint(wall.a, wall.b, t)
}

/**
 * Lichaam-midden (visuele hartlijn) bij parameter t.
 * Gebruik dit i.p.v. `wall.a` wanneer je het midden van de baksteen nodig hebt.
 */
export function wallVisualMid(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
  t = 0.5,
): Point2D {
  const axis = wallAxisPoint(wall, t)
  const mid = wallBalanceMidOffsetCm(wall.thickness, wall.balance)
  if (Math.abs(mid) < 1e-12) return axis
  return offsetPoint(axis, wallLeftNormal(wall), mid)
}

/** Alias: hartlijn = visueel midden van het lichaam (niet per se a/b). */
export function centerlineFromAxis(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
  t = 0.5,
): Point2D {
  return wallVisualMid(wall, t)
}

export type WallFaceSegment = { a: Point2D; b: Point2D }

/** Linker- (+normal) en rechterface (−normal) vanaf de Floorplanner-as. */
export function wallFaces(wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>): {
  left: WallFaceSegment
  right: WallFaceSegment
} {
  const n = wallLeftNormal(wall)
  const { plus, minus } = resolveWallBalanceExtents(wall.thickness, wall.balance)
  return {
    left: {
      a: offsetPoint(wall.a, n, plus),
      b: offsetPoint(wall.b, n, plus),
    },
    right: {
      a: offsetPoint(wall.a, n, -minus),
      b: offsetPoint(wall.b, n, -minus),
    },
  }
}

/** Junction-clustering / keten-index: 0,0001 cm-afronding. */
export const ENDPOINT_KEY_DECIMALS = 4

/** Stabiele knoop-key voor Map-index (niet voor hit-test; zie elevation-wall-faces). */
export function wallEndpointKey(point: Point2D): string {
  const factor = 10 ** ENDPOINT_KEY_DECIMALS
  const rx = Math.round(point.x * factor) / factor
  const ry = Math.round(point.y * factor) / factor
  return `${rx}:${ry}`
}

/** Wereldpositie van openingscentrum op de hartlijn (`t` 0=a … 1=b). */
export function openingWorldCenter(wall: Pick<Wall, 'a' | 'b'>, t: number): Point2D {
  return wallAxisPoint(wall, t)
}

/**
 * Projecteer wereldpunt op muur-as → `t` in [0,1].
 * Degenerate muur (nul-lengte) → 0 (core sanitize/align-contract).
 */
export function projectOpeningT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return 0
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
  return Math.max(0, Math.min(1, t))
}

/** Herprojecteer openingen vanaf vastgelegde wereldcentra (zelfde index-volgorde). */
export function reprojectWallOpenings(wall: Wall, worldCenters: ReadonlyArray<Point2D>): Opening[] {
  return wall.openings.map((opening, index) => ({
    ...opening,
    t: projectOpeningT(wall, worldCenters[index] ?? openingWorldCenter(wall, opening.t)),
  }))
}
