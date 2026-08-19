import type { Point2D, Wall } from '@/core/fml/types'
import { floorplannerLeftNormal } from '@/core/fml/fml-wall-geom'
import { WALL_FACE_SNAP_CM, wallFaceSegments } from './fml-preview-wall-face-snap'

export { WALL_FACE_SNAP_CM }

export function fixtureAabbHalfExtents(
  width: number,
  height: number,
  rotationDeg = 0,
): { hx: number; hy: number } {
  const rad = ((rotationDeg % 360) * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const hw = Math.max(0.5, width) / 2
  const hh = Math.max(0.5, height) / 2
  return { hx: c * hw + s * hh, hy: s * hw + c * hh }
}

function facePadCm(wall: Pick<Wall, 'thickness'>): number {
  return WALL_FACE_SNAP_CM + Math.max(0, wall.thickness)
}

function alongFace(point: Point2D, a: Point2D, b: Point2D, pad: number, axis: 'h' | 'v'): boolean {
  if (axis === 'h') {
    const minX = Math.min(a.x, b.x) - pad
    const maxX = Math.max(a.x, b.x) + pad
    return point.x >= minX && point.x <= maxX
  }
  const minY = Math.min(a.y, b.y) - pad
  const maxY = Math.max(a.y, b.y) + pad
  return point.y >= minY && point.y <= maxY
}

/**
 * Snap fixture-midden zodat een AABB-zijde flush op een muurface komt
 * (niet het midden op de face — dat zou de box in de muur zetten).
 * Orthogonaal: X en Y onafhankelijk (hoek = face-snijpunt).
 */
export function snapFixtureCenterToWallFaces(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>,
  center: Point2D,
  size: { width: number; height: number; rotationDeg?: number },
  radiusCm = WALL_FACE_SNAP_CM,
  opts?: { disabled?: boolean },
): Point2D {
  if (opts?.disabled || walls.length === 0 || radiusCm <= 0) return center
  const { hx, hy } = fixtureAabbHalfExtents(size.width, size.height, size.rotationDeg ?? 0)

  let bestX = center.x
  let bestY = center.y
  let bestDx = radiusCm
  let bestDy = radiusCm
  let bestOblique: Point2D | null = null
  let bestObliqueDist = radiusCm

  for (const wall of walls) {
    const pad = facePadCm(wall)
    for (const face of wallFaceSegments(wall)) {
      if (face.axis === 'h') {
        if (!alongFace(center, face.a, face.b, pad + hx, 'h')) continue
        const y = (face.a.y + face.b.y) / 2
        for (const candidate of [y + hy, y - hy]) {
          const dy = Math.abs(center.y - candidate)
          if (dy >= bestDy) continue
          bestDy = dy
          bestY = candidate
        }
        continue
      }

      if (face.axis === 'v') {
        if (!alongFace(center, face.a, face.b, pad + hy, 'v')) continue
        const x = (face.a.x + face.b.x) / 2
        for (const candidate of [x + hx, x - hx]) {
          const dx = Math.abs(center.x - candidate)
          if (dx >= bestDx) continue
          bestDx = dx
          bestX = candidate
        }
        continue
      }

      const along = { x: face.b.x - face.a.x, y: face.b.y - face.a.y }
      const len = Math.hypot(along.x, along.y)
      if (len < 1e-9) continue
      const n = floorplannerLeftNormal({ x: along.x / len, y: along.y / len })
      const signed = (center.x - face.a.x) * n.x + (center.y - face.a.y) * n.y
      const half = hx * Math.abs(n.x) + hy * Math.abs(n.y)
      const t = ((center.x - face.a.x) * along.x + (center.y - face.a.y) * along.y) / (len * len)
      const padT = (pad + Math.max(hx, hy)) / len
      if (t < -padT || t > 1 + padT) continue
      for (const target of [half, -half]) {
        const delta = target - signed
        const dist = Math.abs(delta)
        if (dist >= bestObliqueDist) continue
        bestObliqueDist = dist
        bestOblique = { x: center.x + n.x * delta, y: center.y + n.y * delta }
      }
    }
  }

  if (bestOblique && bestObliqueDist < Math.min(bestDx, bestDy)) {
    return bestOblique
  }

  const snapped = { x: bestX, y: bestY }
  if (bestDx < radiusCm || bestDy < radiusCm) return snapped
  if (bestOblique) return bestOblique
  return center
}
