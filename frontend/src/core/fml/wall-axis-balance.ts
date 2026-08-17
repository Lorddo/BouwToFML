/**
 * Keep-faces balance: schuif Floorplanner-as (`a`/`b`) mee zodat het muurlichaam
 * vast blijft, en herbouw knooppunten als snijpunten van de nieuwe assen.
 *
 * Keep-axis (flush X-01 in align-wall-junction-balance) blijft apart: as vast,
 * lichaam mag schuiven.
 */
import type { FloorPlan, Opening, Point2D, Wall } from './types'
import {
  axisPointKeepingFaces,
  clampWallBalance,
  offsetWallAxis,
  wallDirectionUnit,
  wallLengthCm,
} from './fml-wall-geom'
import { FML_WALL_BALANCE_FALLBACK } from './extraction-to-plan-geom'

const ENDPOINT_KEY_DECIMALS = 3
const JUNCTION_EPS_CM = 0.75
const PARALLEL_EPS = 1e-9

export type WallSnapBalance = 0 | 0.5 | 1

function endpointKey(point: Point2D): string {
  const factor = 10 ** ENDPOINT_KEY_DECIMALS
  const rx = Math.round(point.x * factor) / factor
  const ry = Math.round(point.y * factor) / factor
  return `${rx}:${ry}`
}

function cloneWall(wall: Wall): Wall {
  return {
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    openings: wall.openings.map((opening) => ({ ...opening })),
  }
}

function openingWorldCenter(wall: Pick<Wall, 'a' | 'b'>, t: number): Point2D {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5))
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * clamped,
    y: wall.a.y + (wall.b.y - wall.a.y) * clamped,
  }
}

function projectT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return 0
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
  return Math.max(0, Math.min(1, t))
}

function reprojectOpenings(wall: Wall, worldCenters: readonly Point2D[]): Opening[] {
  return wall.openings.map((opening, index) => {
    const world = worldCenters[index] ?? openingWorldCenter(wall, opening.t)
    const t = projectT(wall, world)
    return Math.abs(opening.t - t) > 1e-9 ? { ...opening, t } : opening
  })
}

/** Snijpunt van oneindige lijnen p1+u·d1 en p2+v·d2. */
export function intersectInfiniteLines(
  p1: Point2D,
  d1: Point2D,
  p2: Point2D,
  d2: Point2D,
): Point2D | null {
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < PARALLEL_EPS) return null
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const t = (dx * d2.y - dy * d2.x) / cross
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}

type AxisLine = { origin: Point2D; dir: Point2D }

function buildTargetAxis(wall: Wall, targetBalance: number): AxisLine {
  const dir = wallDirectionUnit(wall)
  const origin = axisPointKeepingFaces(wall, targetBalance, 0.5)
  return { origin, dir }
}

function projectOntoAxis(point: Point2D, axis: AxisLine): Point2D {
  const dx = point.x - axis.origin.x
  const dy = point.y - axis.origin.y
  const t = dx * axis.dir.x + dy * axis.dir.y
  return {
    x: axis.origin.x + axis.dir.x * t,
    y: axis.origin.y + axis.dir.y * t,
  }
}

type EndRef = { wallIndex: number; end: 'a' | 'b' }

function buildJunctionGroups(walls: Wall[]): EndRef[][] {
  const buckets = new Map<string, EndRef[]>()
  for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
    const wall = walls[wallIndex]
    for (const end of ['a', 'b'] as const) {
      const point = end === 'a' ? wall.a : wall.b
      const key = endpointKey(point)
      const list = buckets.get(key) ?? []
      list.push({ wallIndex, end })
      buckets.set(key, list)
    }
  }
  // Merge near-duplicate keys (quantization drift).
  const groups: EndRef[][] = []
  const used = new Set<string>()
  const entries = [...buckets.entries()]
  for (let i = 0; i < entries.length; i += 1) {
    const [key, refs] = entries[i]
    if (used.has(key)) continue
    used.add(key)
    const merged = [...refs]
    const [kx, ky] = key.split(':').map(Number)
    for (let j = i + 1; j < entries.length; j += 1) {
      const [otherKey, otherRefs] = entries[j]
      if (used.has(otherKey)) continue
      const [ox, oy] = otherKey.split(':').map(Number)
      if (Math.hypot(kx - ox, ky - oy) <= JUNCTION_EPS_CM) {
        used.add(otherKey)
        merged.push(...otherRefs)
      }
    }
    groups.push(merged)
  }
  return groups
}

/**
 * Zet balance op geselecteerde muren met lichaam vast; herbouw knooppunten.
 * Niet-geselecteerde muren houden hun as (dienen als snij-constraint).
 */
export function setWallsBalanceKeepingFaces(
  walls: Wall[],
  wallIds: Iterable<string>,
  nextBalance: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0 || walls.length === 0) return walls

  const target = clampWallBalance(nextBalance)
  let needsChange = false
  for (const wall of walls) {
    if (!idSet.has(wall.id)) continue
    if (clampWallBalance(wall.balance) !== target) {
      needsChange = true
      break
    }
  }
  if (!needsChange) return walls

  const openingCenters = walls.map((wall) =>
    wall.openings.map((opening) => openingWorldCenter(wall, opening.t)),
  )

  const targets = walls.map((wall) =>
    idSet.has(wall.id) ? target : clampWallBalance(wall.balance),
  )
  const axes = walls.map((wall, index) => buildTargetAxis(wall, targets[index]))

  const next = walls.map((wall, index) => {
    const cloned = cloneWall(wall)
    cloned.balance = targets[index]
    // Voorlopige as: loodrechte keep-faces shift (vrije koppen).
    if (idSet.has(wall.id)) {
      const shifted = offsetWallAxis(wall, wall.balance, targets[index])
      cloned.a = shifted.a
      cloned.b = shifted.b
    }
    return cloned
  })

  const junctions = buildJunctionGroups(walls)
  for (const group of junctions) {
    if (group.length === 0) continue

    if (group.length === 1) {
      const { wallIndex, end } = group[0]
      if (!idSet.has(walls[wallIndex].id)) continue
      const projected = projectOntoAxis(
        end === 'a' ? walls[wallIndex].a : walls[wallIndex].b,
        axes[wallIndex],
      )
      if (end === 'a') next[wallIndex].a = projected
      else next[wallIndex].b = projected
      continue
    }

    // Multi-wall junction: snijd assen van de betrokken muren.
    const uniqueWalls = [...new Set(group.map((ref) => ref.wallIndex))]
    let junctionPoint: Point2D | null = null

    if (uniqueWalls.length >= 2) {
      // Zoek eerste niet-parallel paar.
      outer: for (let i = 0; i < uniqueWalls.length; i += 1) {
        for (let j = i + 1; j < uniqueWalls.length; j += 1) {
          const left = axes[uniqueWalls[i]]
          const right = axes[uniqueWalls[j]]
          const hit = intersectInfiniteLines(left.origin, left.dir, right.origin, right.dir)
          if (hit) {
            junctionPoint = hit
            break outer
          }
        }
      }
    }

    if (!junctionPoint) {
      // Collinear / single-direction: project op eerste as.
      const first = group[0]
      const old = first.end === 'a' ? walls[first.wallIndex].a : walls[first.wallIndex].b
      junctionPoint = projectOntoAxis(old, axes[first.wallIndex])
    }

    for (const { wallIndex, end } of group) {
      if (end === 'a') next[wallIndex].a = { ...junctionPoint }
      else next[wallIndex].b = { ...junctionPoint }
    }
  }

  for (let index = 0; index < next.length; index += 1) {
    if (wallLengthCm(next[index]) < 1e-6) continue
    next[index].openings = reprojectOpenings(next[index], openingCenters[index])
  }

  return next
}

/** Eén muur: keep-faces zonder stitch (geen buren). */
export function setBalanceKeepingFaces(wall: Wall, nextBalance: number): Wall {
  const [result] = setWallsBalanceKeepingFaces([wall], [wall.id], nextBalance)
  return result
}

/**
 * Zet alle muren van een plan op dezelfde snap (0 / 0.5 / 1) met lichaam vast.
 * Default-export blijft 0.5 → no-op als alles al 0.5 is.
 */
export function rebasePlanSnap(plan: FloorPlan, snap: WallSnapBalance): FloorPlan {
  const target = clampWallBalance(snap)
  return {
    ...plan,
    floors: plan.floors.map((floor) => {
      if (floor.walls.length === 0) return floor
      const already = floor.walls.every((wall) => clampWallBalance(wall.balance) === target)
      if (already) return floor
      const ids = floor.walls.map((wall) => wall.id)
      return {
        ...floor,
        walls: setWallsBalanceKeepingFaces(floor.walls, ids, target),
      }
    }),
  }
}

/**
 * Eerst keep-faces naar 0.5 (as naar lichaam-midden), daarna dikte zetten.
 * Voorkomt sprong wanneer geïmporteerde face-as (B=0/1) naar gecentreerd gaat.
 */
export function setWallsThicknessKeepingFaces(
  walls: Wall[],
  wallIds: Iterable<string>,
  thicknessCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  const clamped = Math.max(1, Math.min(200, thicknessCm))

  const needsBalanceReset = walls.some(
    (wall) => idSet.has(wall.id) && clampWallBalance(wall.balance) !== FML_WALL_BALANCE_FALLBACK,
  )
  const centered = needsBalanceReset
    ? setWallsBalanceKeepingFaces(walls, idSet, FML_WALL_BALANCE_FALLBACK)
    : walls

  let changed = needsBalanceReset
  const next = centered.map((wall) => {
    if (!idSet.has(wall.id)) return wall
    if (
      wall.thickness === clamped &&
      clampWallBalance(wall.balance) === FML_WALL_BALANCE_FALLBACK
    ) {
      return wall
    }
    changed = true
    return {
      ...wall,
      thickness: clamped,
      balance: FML_WALL_BALANCE_FALLBACK,
      a: { ...wall.a },
      b: { ...wall.b },
      openings: wall.openings.map((opening) => ({ ...opening })),
    }
  })
  return changed ? next : walls
}
