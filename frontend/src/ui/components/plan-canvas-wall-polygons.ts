import { floorplannerLeftNormal } from '@/core/fml/fml-wall-geom'
import type { Point2D } from '@/core/fml/types'
import { resolveWallExtents } from '@/ui/components/plan-canvas-wall-fill'

export type {
  WallFillComponent,
  WallOutlineOpeningInput,
  WallOutlinePolyline,
  WallPolygon,
  WallPolygonInput,
  WallRenderGeometry,
} from '@/ui/components/plan-canvas-wall-polygons-types'

export {
  buildWallRenderGeometry,
  maxFillVertexDistanceFromWallEnds,
  pointInFillComponents,
  resolveWallExtents,
  wallFillComponentsToPathData,
} from '@/ui/components/plan-canvas-wall-fill'

export { buildWallOutlinePolylines } from '@/ui/components/plan-canvas-wall-outline'

/** cm along left normal from axis to body mid-thickness (0 when balance = 0.5). */
export function wallBalanceMidOffsetCm(thickness: number, balance?: number): number {
  const { plus, minus } = resolveWallExtents({ thickness, balance })
  return (plus - minus) / 2
}

/** Shift an axis point onto the wall body mid-line for the given balance. */
export function offsetPointByWallBalance(
  point: Point2D,
  wallUnit: Point2D,
  thickness: number,
  balance?: number,
): Point2D {
  const mid = wallBalanceMidOffsetCm(thickness, balance)
  if (Math.abs(mid) < 1e-9) return point
  const n = floorplannerLeftNormal(wallUnit)
  return { x: point.x + n.x * mid, y: point.y + n.y * mid }
}

/** Flat `[x,y,…]` polyline in cm — same mid-line shift as {@link offsetPointByWallBalance}. */
export function offsetFlatPointsByWallBalance(
  points: number[],
  wallUnit: Point2D,
  thickness: number,
  balance?: number,
): number[] {
  const mid = wallBalanceMidOffsetCm(thickness, balance)
  if (Math.abs(mid) < 1e-9 || points.length < 2) return points
  const n = floorplannerLeftNormal(wallUnit)
  const ox = n.x * mid
  const oy = n.y * mid
  const out = points.slice()
  for (let i = 0; i + 1 < out.length; i += 2) {
    out[i] += ox
    out[i + 1] += oy
  }
  return out
}
