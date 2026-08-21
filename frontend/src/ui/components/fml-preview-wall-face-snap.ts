import { floorplannerLeftNormal } from '@/core/fml/fml-wall-geom'
import type { Point2D, Wall } from '@/core/fml/types'
import { WALL_AXIS_EPS_CM } from './fml-preview-junction-core'
import { resolveWallExtents } from './fml-preview-wall-polygons'

/** Soft snap naar lange binnen-/buitenfaces (cm); Ctrl/Cmd schakelt uit. */
export const WALL_FACE_SNAP_CM = 15

export interface WallFaceSegment {
  a: Point2D
  b: Point2D
  /** 'h' = constante Y, 'v' = constante X, 'oblique' = schuin. */
  axis: 'h' | 'v' | 'oblique'
}

function normalize(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y)
  if (len < 1e-9) return { x: 1, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

function offsetPoint(point: Point2D, n: Point2D, dist: number): Point2D {
  return { x: point.x + n.x * dist, y: point.y + n.y * dist }
}

function classifyAxis(a: Point2D, b: Point2D): 'h' | 'v' | 'oblique' {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (dx < WALL_AXIS_EPS_CM && dy < WALL_AXIS_EPS_CM) return 'h'
  if (dy <= WALL_AXIS_EPS_CM) return 'h'
  if (dx <= WALL_AXIS_EPS_CM) return 'v'
  return 'oblique'
}

/**
 * Lange plus-/minus-faces van een muur (balance-aware).
 * Plus = Floorplanner-as + leftNormal * plus; minus = as − leftNormal * minus.
 */
export function wallFaceSegments(
  wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>,
): WallFaceSegment[] {
  const along = normalize({ x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y })
  const n = floorplannerLeftNormal(along)
  const { plus, minus } = resolveWallExtents(wall)
  const axis = classifyAxis(wall.a, wall.b)
  return [
    {
      a: offsetPoint(wall.a, n, plus),
      b: offsetPoint(wall.b, n, plus),
      axis,
    },
    {
      a: offsetPoint(wall.a, n, -minus),
      b: offsetPoint(wall.b, n, -minus),
      axis,
    },
  ]
}

function facePadCm(wall: Pick<Wall, 'thickness'>): number {
  return WALL_FACE_SNAP_CM + Math.max(0, wall.thickness)
}

/** Projectie op oneindige lijn; t in [0,1] = op segment. */
function projectOnSegment(
  point: Point2D,
  a: Point2D,
  b: Point2D,
): { t: number; projected: Point2D; dist: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) {
    const dist = Math.hypot(point.x - a.x, point.y - a.y)
    return { t: 0, projected: { x: a.x, y: a.y }, dist }
  }
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2
  const projected = { x: a.x + dx * t, y: a.y + dy * t }
  const dist = Math.hypot(point.x - projected.x, point.y - projected.y)
  return { t, projected, dist }
}

function tInPaddedRange(t: number, padAlong: number, len: number): boolean {
  if (len < 1e-9) return Math.abs(t) <= 1
  const padT = padAlong / len
  return t >= -padT && t <= 1 + padT
}

/**
 * Soft snap naar muurfaces (binnen/buiten), niet naar hartlijn of knoop.
 * Orthogonaal: X en Y onafhankelijk → hoek = face-snijpunt.
 * Schuin: dichtstbijzijnde punt op de face (beide assen).
 *
 * `infiniteAxes`: H/V-faces als oneindige assen (handmatig buiten footprint).
 */
export function snapPointToWallFaces(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>,
  point: Point2D,
  radiusCm = WALL_FACE_SNAP_CM,
  opts?: { disabled?: boolean; infiniteAxes?: boolean },
): Point2D {
  if (opts?.disabled || walls.length === 0 || radiusCm <= 0) return point
  const infinite = opts?.infiniteAxes === true

  let bestX = point.x
  let bestY = point.y
  let bestDx = radiusCm
  let bestDy = radiusCm
  let bestOblique: Point2D | null = null
  let bestObliqueDist = radiusCm

  for (const wall of walls) {
    const pad = facePadCm(wall)
    const faces = wallFaceSegments(wall)
    for (const face of faces) {
      const len = Math.hypot(face.b.x - face.a.x, face.b.y - face.a.y)

      if (face.axis === 'h') {
        const y = (face.a.y + face.b.y) / 2
        const dy = Math.abs(point.y - y)
        if (dy >= bestDy) continue
        if (!infinite) {
          const minX = Math.min(face.a.x, face.b.x) - pad
          const maxX = Math.max(face.a.x, face.b.x) + pad
          if (point.x < minX || point.x > maxX) continue
        }
        bestDy = dy
        bestY = y
        continue
      }

      if (face.axis === 'v') {
        const x = (face.a.x + face.b.x) / 2
        const dx = Math.abs(point.x - x)
        if (dx >= bestDx) continue
        if (!infinite) {
          const minY = Math.min(face.a.y, face.b.y) - pad
          const maxY = Math.max(face.a.y, face.b.y) + pad
          if (point.y < minY || point.y > maxY) continue
        }
        bestDx = dx
        bestX = x
        continue
      }

      const hit = projectOnSegment(point, face.a, face.b)
      if (hit.dist >= bestObliqueDist) continue
      if (infinite) {
        // Schuin: projectie op oneindige face-lijn
        bestObliqueDist = hit.dist
        bestOblique = { x: hit.projected.x, y: hit.projected.y }
        continue
      }
      if (!tInPaddedRange(hit.t, pad, len)) continue
      bestObliqueDist = hit.dist
      bestOblique = { x: hit.projected.x, y: hit.projected.y }
    }
  }

  if (bestOblique && bestObliqueDist < Math.min(bestDx, bestDy)) {
    return bestOblique
  }

  const snapped = { x: bestX, y: bestY }
  if (bestDx < radiusCm || bestDy < radiusCm) return snapped
  if (bestOblique) return bestOblique
  return point
}

/** Grotere radius + oneindige H/V-assen voor handmatige maten buiten de footprint. */
export const MANUAL_DIM_FACE_SNAP_CM = 60
