import type { Point2D, Wall } from '@/core/fml/types'
import {
  MIN_SPLIT_SEGMENT_CM,
  BALANCE_DEFAULT,
  BALANCE_MAX,
  BALANCE_MIN,
  cloneWalls,
  distance,
  stableJunctionId,
  type SplitWallResult,
} from './fml-preview-junction-core'

export function clampBalance(balance: number): number {
  if (!Number.isFinite(balance)) return BALANCE_DEFAULT
  const clamped = Math.min(BALANCE_MAX, Math.max(BALANCE_MIN, balance))
  return Math.round(clamped * 100) / 100
}

export function setWallBalance(walls: Wall[], wallId: string, balance: number): Wall[] {
  return setWallsBalance(walls, [wallId], balance)
}

export function setWallsBalance(walls: Wall[], wallIds: Iterable<string>, balance: number): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  const clamped = clampBalance(balance)
  const next = cloneWalls(walls)
  let changed = false
  for (const wall of next) {
    if (!idSet.has(wall.id)) continue
    if (wall.balance !== clamped) {
      wall.balance = clamped
      changed = true
    }
  }
  return changed ? next : walls
}

export function setWallThickness(walls: Wall[], wallId: string, thicknessCm: number): Wall[] {
  return setWallsThickness(walls, [wallId], thicknessCm)
}

export function setWallsThickness(
  walls: Wall[],
  wallIds: Iterable<string>,
  thicknessCm: number,
): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  const clamped = Math.max(1, Math.min(200, thicknessCm))
  const next = cloneWalls(walls)
  let changed = false
  for (const wall of next) {
    if (!idSet.has(wall.id)) continue
    if (wall.thickness !== clamped) {
      wall.thickness = clamped
      changed = true
    }
  }
  return changed ? next : walls
}

/** Verwijder één muursegment (openingen op die muur gaan mee). */
export function removeWall(walls: Wall[], wallId: string): Wall[] {
  return removeWalls(walls, [wallId])
}

/** Verwijder meerdere muursegmenten (openingen op die muren gaan mee). */
export function removeWalls(walls: Wall[], wallIds: Iterable<string>): Wall[] {
  const idSet = new Set(wallIds)
  if (idSet.size === 0) return walls
  const next = walls.filter((wall) => !idSet.has(wall.id))
  return next.length === walls.length ? walls : next
}

/**
 * Split een muur op parameter `t` (0–1 langs a→b) in twee segmenten met een gedeeld hoekpunt.
 * `t` wordt geclamped zodat beide segmenten ≥ {@link MIN_SPLIT_SEGMENT_CM} blijven.
 */
export function splitWallAtT(
  walls: Wall[],
  wallId: string,
  tSplit = 0.5,
): SplitWallResult | null {
  const index = walls.findIndex((item) => item.id === wallId)
  if (index < 0) return null

  const wall = walls[index]
  const len = distance(wall.a, wall.b)
  if (len < MIN_SPLIT_SEGMENT_CM * 2) return null

  const tMin = MIN_SPLIT_SEGMENT_CM / len
  const tMax = 1 - MIN_SPLIT_SEGMENT_CM / len
  const t = Math.min(tMax, Math.max(tMin, tSplit))

  const splitPoint = {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  }
  const secondWallId = `${wallId}-split-${crypto.randomUUID().slice(0, 8)}`

  const firstOpenings = wall.openings
    .filter((opening) => opening.t <= t)
    .map((opening) => ({ ...opening, t: t > 1e-6 ? opening.t / t : 0.5 }))
  const secondOpenings = wall.openings
    .filter((opening) => opening.t > t)
    .map((opening) => ({ ...opening, t: (opening.t - t) / (1 - t) }))

  const firstWall: Wall = {
    ...wall,
    b: { ...splitPoint },
    openings: firstOpenings,
  }
  const secondWall: Wall = {
    ...wall,
    id: secondWallId,
    a: { ...splitPoint },
    openings: secondOpenings,
  }

  const next = [...walls.slice(0, index), firstWall, secondWall, ...walls.slice(index + 1)]
  const junctionId = stableJunctionId([
    { wallId: firstWall.id, end: 'b' },
    { wallId: secondWallId, end: 'a' },
  ])

  return {
    walls: next,
    junctionId,
    firstWallId: firstWall.id,
    secondWallId,
  }
}

/** Split een muur op het midden in twee segmenten met een gedeeld hoekpunt. */
export function splitWallAtMidpoint(walls: Wall[], wallId: string): SplitWallResult | null {
  return splitWallAtT(walls, wallId, 0.5)
}
