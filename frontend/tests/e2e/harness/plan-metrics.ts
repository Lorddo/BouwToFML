import type { Opening, OpeningType, Wall } from '@/core/fml/types'
import { totalWallLengthCm, wallLengthCm } from '@/core/fml/fml-wall-geom'

export type Point2 = { x: number; y: number }

export type PlanBBox = { minX: number; minY: number; maxX: number; maxY: number }

/** Standaard match-afstand voor dekking/precisie/opening-recall (cm). */
export const REFERENCE_MATCH_DIST_CM = 20

/** Sample-stap langs hartlijn (cm). */
export const REFERENCE_SAMPLE_STEP_CM = 5

export function wallsBBox(walls: Wall[]): PlanBBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const wall of walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x)
    minY = Math.min(minY, wall.a.y, wall.b.y)
    maxX = Math.max(maxX, wall.a.x, wall.b.x)
    maxY = Math.max(maxY, wall.a.y, wall.b.y)
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

/** Verschuif alle muren zodat bbox-min in (0,0) ligt — maakt plans vergelijkbaar. */
export function translateWallsToOrigin(walls: Wall[]): Wall[] {
  const box = wallsBBox(walls)
  if (box.minX === 0 && box.minY === 0) return walls
  return walls.map((wall) => ({
    ...wall,
    a: { x: wall.a.x - box.minX, y: wall.a.y - box.minY },
    b: { x: wall.b.x - box.minX, y: wall.b.y - box.minY },
    openings: wall.openings.map((op) => ({ ...op })),
  }))
}

export function distPointToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function minDistToWalls(p: Point2, walls: Wall[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const wall of walls) {
    const d = distPointToSegment(p, wall.a, wall.b)
    if (d < best) best = d
  }
  return best
}

/** Lengte van `source` die binnen `maxDistCm` van `target` ligt (sample-based). */
export function coveredLengthCm(
  source: Wall[],
  target: Wall[],
  maxDistCm = REFERENCE_MATCH_DIST_CM,
  stepCm = REFERENCE_SAMPLE_STEP_CM,
): number {
  if (source.length <= 0 || target.length <= 0) return 0
  let covered = 0
  for (const wall of source) {
    const len = wallLengthCm(wall)
    if (len <= 0) continue
    const steps = Math.max(1, Math.ceil(len / stepCm))
    let hit = 0
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const p = {
        x: wall.a.x + (wall.b.x - wall.a.x) * t,
        y: wall.a.y + (wall.b.y - wall.a.y) * t,
      }
      if (minDistToWalls(p, target) <= maxDistCm) hit += 1
    }
    covered += (hit / (steps + 1)) * len
  }
  return covered
}

/** Grootste afstand van een `source`-punt tot de dichtstbijzijnde `target`-muur. */
export function maxDistToWallsCm(
  source: Wall[],
  target: Wall[],
  stepCm = REFERENCE_SAMPLE_STEP_CM,
): number {
  if (source.length <= 0 || target.length <= 0) return 0
  let worst = 0
  for (const wall of source) {
    const len = wallLengthCm(wall)
    const steps = Math.max(1, Math.ceil(len / stepCm))
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const p = {
        x: wall.a.x + (wall.b.x - wall.a.x) * t,
        y: wall.a.y + (wall.b.y - wall.a.y) * t,
      }
      worst = Math.max(worst, minDistToWalls(p, target))
    }
  }
  return worst
}

export function openingCenterCm(wall: Wall, opening: Opening): Point2 {
  const t = Number.isFinite(opening.t) ? opening.t : 0.5
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  }
}

export type OpeningSite = {
  type: OpeningType
  center: Point2
  width: number
}

export function collectOpeningSites(walls: Wall[]): OpeningSite[] {
  const sites: OpeningSite[] = []
  for (const wall of walls) {
    for (const opening of wall.openings) {
      sites.push({
        type: opening.type,
        center: openingCenterCm(wall, opening),
        width: opening.width,
      })
    }
  }
  return sites
}

/** Greedy 1-1 match: zelfde type, dichtstbij binnen maxDist. */
export function countMatchedOpenings(
  reference: OpeningSite[],
  detected: OpeningSite[],
  maxDistCm = REFERENCE_MATCH_DIST_CM,
): { matched: number; byType: Record<OpeningType, number> } {
  const byType: Record<OpeningType, number> = { door: 0, window: 0 }
  const used = new Set<number>()
  let matched = 0
  for (const ref of reference) {
    let bestIdx = -1
    let bestDist = maxDistCm
    for (let i = 0; i < detected.length; i += 1) {
      if (used.has(i)) continue
      const det = detected[i]
      if (det.type !== ref.type) continue
      const d = Math.hypot(det.center.x - ref.center.x, det.center.y - ref.center.y)
      if (d <= bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx)
      matched += 1
      byType[ref.type] += 1
    }
  }
  return { matched, byType }
}

export { totalWallLengthCm, wallLengthCm }
