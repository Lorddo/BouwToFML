/**
 * Paint-helpers voor gevel-aanzicht: diepte-vlakken, baksteen-ringen, binnenkant.
 */
import {
  ELEVATION_SAME_PLANE_CM,
  elevationWallYsAtX,
  type ElevationOpeningRect,
  type ElevationRect,
  type ElevationWallRect,
  type FacadeElevation,
} from './facade-elevation'
import { elevationOpeningHolePoints } from './elevation-opening-symbol'
import type { OpeningType, Point2D } from './types'

export type ElevationPaintPlane = {
  depthCm: number
  walls: ElevationWallRect[]
  /** Kopse nok: ná baksteen, zoals ramen. */
  endOnRidges: ElevationWallRect[]
  openings: ElevationOpeningRect[]
  transoms: ElevationOpeningRect[]
}

function wallOnPlane(plane: ElevationPaintPlane, wallId: string, floorIndex: number): boolean {
  return plane.walls.some((wall) => wall.wallId === wallId && wall.floorIndex === floorIndex)
}

/**
 * Zelfde diepte = één vlak: eerst alle baksteen, daarna de openingen.
 * Anders dekt een gesplitste buurmuur de helft van een raam.
 */
function elevationXOverlaps(a: ElevationWallRect, b: ElevationWallRect): boolean {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1
}

export function groupElevationPaintPlanes(elevation: FacadeElevation): ElevationPaintPlane[] {
  const planes: ElevationPaintPlane[] = []
  for (const wall of elevation.walls) {
    if (wall.ridge && wall.endOn) continue
    const last = planes[planes.length - 1]
    if (last && wall.depthCm <= last.depthCm + ELEVATION_SAME_PLANE_CM) {
      last.walls.push(wall)
      last.depthCm = Math.max(last.depthCm, wall.depthCm)
      continue
    }
    planes.push({
      depthCm: wall.depthCm,
      walls: [wall],
      endOnRidges: [],
      openings: [],
      transoms: [],
    })
  }
  for (const ridge of elevation.walls) {
    if (!ridge.ridge || !ridge.endOn) continue
    const host =
      [...planes]
        .reverse()
        .find((plane) =>
          plane.walls.some(
            (wall) =>
              wall.floorIndex === ridge.floorIndex &&
              !wall.ridge &&
              elevationXOverlaps(wall, ridge),
          ),
        ) ?? planes[planes.length - 1]
    if (!host) {
      planes.push({
        depthCm: ridge.depthCm,
        walls: [],
        endOnRidges: [ridge],
        openings: [],
        transoms: [],
      })
      continue
    }
    host.endOnRidges.push(ridge)
  }
  for (const opening of elevation.openings) {
    const plane = planes.find((item) => wallOnPlane(item, opening.wallId, opening.floorIndex))
    plane?.openings.push(opening)
  }
  for (const transom of elevation.transoms) {
    const plane = planes.find((item) => wallOnPlane(item, transom.wallId, transom.floorIndex))
    plane?.transoms.push(transom)
  }
  return planes
}

export function elevationWallHasInnerFace(wall: ElevationWallRect): boolean {
  return elevationWallInnerStrokes(wall).length > 0
}

/**
 * Baksteen: oren recht omhoog, schuine top alleen tussen de hartlijn.
 * Hoogte komt van `az`/`bz` (hartlijn); X = buiten tot buiten.
 */
export function elevationWallFillPoints(wall: ElevationWallRect): Point2D[] {
  const points: Point2D[] = [wall.aBottom, wall.aTop]
  if (Math.abs(wall.aTop.x - wall.xa) > 0.5) points.push({ x: wall.xa, y: wall.aTop.y })
  if (Math.abs(wall.bTop.x - wall.xb) > 0.5) points.push({ x: wall.xb, y: wall.bTop.y })
  points.push(wall.bTop, wall.bBottom)
  return points
}

/** Opening/bovenlicht geknipt tot de baksteen (anders evenodd buiten de muur). */
export function clipElevationOpeningToWall(
  wall: ElevationWallRect,
  rect: ElevationRect,
): ElevationRect | null {
  const x0 = Math.max(Math.min(rect.x0, rect.x1), Math.min(wall.aTop.x, wall.bTop.x))
  const x1 = Math.min(Math.max(rect.x0, rect.x1), Math.max(wall.aTop.x, wall.bTop.x))
  if (x1 - x0 < 1) return null
  const ys0 = elevationWallYsAtX(wall, x0)
  const ys1 = elevationWallYsAtX(wall, x1)
  if (!ys0 || !ys1) return null
  const wallTop = Math.min(ys0.top, ys1.top)
  const wallBot = Math.max(ys0.bot, ys1.bot)
  const y0 = Math.max(Math.min(rect.y0, rect.y1), wallTop)
  const y1 = Math.min(Math.max(rect.y0, rect.y1), wallBot)
  if (y1 - y0 < 1) return null
  return { x0, y0, x1, y1 }
}

/**
 * Evenodd-ringen: buitencontour + gaten voor openingen. Goedkoop (N gaten, geen dest-out).
 * Nok krijgt geen gaten.
 */
export function elevationWallFillRings(
  wall: ElevationWallRect,
  openings: readonly ElevationRect[] = [],
): Point2D[][] {
  const outer = elevationWallFillPoints(wall)
  if (wall.ridge || openings.length === 0) return [outer]
  const holes: Point2D[][] = []
  for (const opening of openings) {
    const hole = clipElevationOpeningToWall(wall, opening)
    if (!hole) continue
    const typed = opening as ElevationRect & {
      type?: OpeningType
      refid?: string
      mirrored?: [number, number]
      startOnLeft?: boolean
    }
    holes.push(
      typed.type && typed.refid
        ? elevationOpeningHolePoints(hole, typed.type, typed.refid, {
            mirrored: typed.mirrored,
            startOnLeft: typed.startOnLeft,
          })
        : [
            { x: hole.x0, y: hole.y0 },
            { x: hole.x1, y: hole.y0 },
            { x: hole.x1, y: hole.y1 },
            { x: hole.x0, y: hole.y1 },
          ],
    )
  }
  return holes.length === 0 ? [outer] : [outer, ...holes]
}

/** Binnenkant: staanders + top (hoogte = hartlijn-einde). Hartlijn blijft onzichtbaar. */
export function elevationWallInnerStrokes(
  wall: ElevationWallRect,
): Array<{ a: Point2D; b: Point2D }> {
  if (wall.ridge) return []
  const strokes: Array<{ a: Point2D; b: Point2D }> = []
  const hasA = Math.abs(wall.innerATop.x - wall.aTop.x) > 0.5
  const hasB = Math.abs(wall.innerBTop.x - wall.bTop.x) > 0.5
  if (hasA) {
    strokes.push({
      a: { x: wall.innerATop.x, y: wall.aBottom.y },
      b: { x: wall.innerATop.x, y: wall.innerATop.y },
    })
  }
  if (hasB) {
    strokes.push({
      a: { x: wall.innerBTop.x, y: wall.bBottom.y },
      b: { x: wall.innerBTop.x, y: wall.innerBTop.y },
    })
  }
  const top: Point2D[] = [wall.innerATop]
  if (Math.abs(wall.innerATop.x - wall.xa) > 0.5) top.push({ x: wall.xa, y: wall.innerATop.y })
  if (Math.abs(wall.innerBTop.x - wall.xb) > 0.5) top.push({ x: wall.xb, y: wall.innerBTop.y })
  top.push(wall.innerBTop)
  for (let i = 0; i < top.length - 1; i += 1) {
    const a = top[i]
    const b = top[i + 1]
    if (!a || !b) continue
    if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) strokes.push({ a, b })
  }
  return strokes
}
