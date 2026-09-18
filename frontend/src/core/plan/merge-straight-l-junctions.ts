/**
 * Las degree-2 knopen die bijna 180° zijn (fake L / restant T-naad).
 *
 * Harmonize groepeert collineair alleen voor dikte; sanitize knipt T/X.
 * Als de T-arm weg is (stempel zonder binnenmuren, band-filter) blijft een
 * 180°-L staan. Alleen echte hoeken (~90°) blijven knopen.
 */
import type { WallIdRemap } from './facade-groups'
import { buildJunctions } from './junction-core'
import { openingWorldCenter, reprojectWallOpenings, wallLengthCm } from './plan-wall-geom'
import { isStampOwnedWall } from './stamp-owned'
import type { Opening, Point2D, Wall } from './types'

/** Afwijking van 180° die nog als doorgaande as telt (zelfde orde als harmonize). */
export const STRAIGHT_L_MAX_TURN_DEG = 12

/** Relatieve dikte-ruis; echte stap (10 vs 30) blijft gesplitst. */
const THICKNESS_HYSTERESIS_RATIO = 0.15
const THICKNESS_ABS_EPS_CM = 0.05
const ZERO_LEN_CM = 0.5

const STRAIGHT_DOT = Math.cos((STRAIGHT_L_MAX_TURN_DEG * Math.PI) / 180)

export type MergeStraightLResult = {
  walls: Wall[]
  remaps: WallIdRemap[]
  mergedCount: number
}

function cloneOpening(opening: Opening): Opening {
  return {
    ...opening,
    mirrored: opening.mirrored
      ? ([opening.mirrored[0], opening.mirrored[1]] as [number, number])
      : undefined,
    extras: opening.extras ? { ...opening.extras } : undefined,
  }
}

function cloneWall(wall: Wall): Wall {
  return {
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    c: wall.c ? { ...wall.c } : wall.c,
    openings: wall.openings.map(cloneOpening),
    elevation: wall.elevation
      ? { a: { ...wall.elevation.a }, b: { ...wall.elevation.b } }
      : undefined,
    extras: wall.extras ? { ...wall.extras } : undefined,
  }
}

function isRidgeLike(wall: Wall): boolean {
  if (wall.role === 'ridge') return true
  return wall.extras?.ridge === true
}

function rolesCompatible(a: Wall, b: Wall): boolean {
  if (isRidgeLike(a) || isRidgeLike(b)) return false
  return (a.role ?? null) === (b.role ?? null)
}

function thicknessesCompatible(aCm: number, bCm: number): boolean {
  if (!(aCm > 0) || !(bCm > 0)) return true
  if (Math.abs(aCm - bCm) <= THICKNESS_ABS_EPS_CM) return true
  const larger = Math.max(aCm, bCm)
  return Math.abs(aCm - bCm) / larger <= THICKNESS_HYSTERESIS_RATIO
}

function outgoingUnit(wall: Wall, end: 'a' | 'b'): Point2D {
  const from = wall[end]
  const to = end === 'a' ? wall.b : wall.a
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { x: 1, y: 0 }
  return { x: dx / len, y: dy / len }
}

function isStraightContinuation(
  left: Wall,
  leftEnd: 'a' | 'b',
  right: Wall,
  rightEnd: 'a' | 'b',
): boolean {
  const u = outgoingUnit(left, leftEnd)
  const v = outgoingUnit(right, rightEnd)
  return u.x * v.x + u.y * v.y <= -STRAIGHT_DOT
}

function isGeneratedWallId(id: string): boolean {
  return (
    id.startsWith('split-host-') ||
    id.startsWith('sanitize-') ||
    id.startsWith('straight-l-')
  )
}

function pickSurvivor(left: Wall, right: Wall): Wall {
  const leftOwned = isStampOwnedWall(left)
  const rightOwned = isStampOwnedWall(right)
  if (leftOwned !== rightOwned) return leftOwned ? left : right
  const leftGen = isGeneratedWallId(left.id)
  const rightGen = isGeneratedWallId(right.id)
  if (leftGen !== rightGen) return leftGen ? right : left
  const leftLen = wallLengthCm(left)
  const rightLen = wallLengthCm(right)
  if (Math.abs(leftLen - rightLen) > 1e-6) return leftLen >= rightLen ? left : right
  return left.id.localeCompare(right.id) <= 0 ? left : right
}

function farEnd(end: 'a' | 'b'): 'a' | 'b' {
  return end === 'a' ? 'b' : 'a'
}

function endpointElev(wall: Wall, end: 'a' | 'b'): { z: number; h: number } | undefined {
  return end === 'a' ? wall.elevation?.a : wall.elevation?.b
}

function joinPair(
  left: Wall,
  leftEnd: 'a' | 'b',
  right: Wall,
  rightEnd: 'a' | 'b',
): Wall {
  const survivor = pickSurvivor(left, right)
  const other = survivor === left ? right : left
  const survEnd = survivor === left ? leftEnd : rightEnd
  const othEnd = survivor === left ? rightEnd : leftEnd
  const survFar = farEnd(survEnd)
  const othFar = farEnd(othEnd)

  const a = survFar === 'a' ? survivor.a : other[othFar]
  const b = survFar === 'b' ? survivor.b : other[othFar]
  const elevA = survFar === 'a' ? endpointElev(survivor, 'a') : endpointElev(other, othFar)
  const elevB = survFar === 'b' ? endpointElev(survivor, 'b') : endpointElev(other, othFar)
  const elevation =
    elevA && elevB
      ? { a: { ...elevA }, b: { ...elevB } }
      : survivor.elevation
        ? { a: { ...survivor.elevation.a }, b: { ...survivor.elevation.b } }
        : undefined

  const worldCenters = [
    ...left.openings.map((opening) => openingWorldCenter(left, opening.t)),
    ...right.openings.map((opening) => openingWorldCenter(right, opening.t)),
  ]
  const openings = [...left.openings, ...right.openings].map(cloneOpening)
  const merged: Wall = {
    ...cloneWall(survivor),
    a: { ...a },
    b: { ...b },
    elevation,
    openings,
    stampOwned: isStampOwnedWall(left) || isStampOwnedWall(right) ? true : survivor.stampOwned,
  }
  merged.openings = reprojectWallOpenings(merged, worldCenters)
  return merged
}

/**
 * Herhaal tot stabiel: elke degree-2 180°-L wordt één segment.
 * T/X (3+ armen) en echte ~90°-hoeken blijven.
 */
export function mergeStraightLJunctions(walls: readonly Wall[]): MergeStraightLResult {
  if (walls.length < 2) {
    return { walls: walls.map(cloneWall), remaps: [], mergedCount: 0 }
  }

  let work = walls.map(cloneWall)
  const remaps: WallIdRemap[] = []
  let mergedCount = 0
  let guard = 0
  const max = Math.max(8, work.length * 4)

  while (guard < max) {
    guard += 1
    const junctions = buildJunctions(work)
    let merged = false

    for (const junction of junctions) {
      if (junction.refs.length !== 2) continue
      const leftRef = junction.refs[0]
      const rightRef = junction.refs[1]
      if (!leftRef || !rightRef) continue
      if (leftRef.wallId === rightRef.wallId) continue

      const left = work.find((wall) => wall.id === leftRef.wallId)
      const right = work.find((wall) => wall.id === rightRef.wallId)
      if (!left || !right) continue
      if (wallLengthCm(left) <= ZERO_LEN_CM || wallLengthCm(right) <= ZERO_LEN_CM) continue
      if (!rolesCompatible(left, right)) continue
      if (!thicknessesCompatible(left.thickness, right.thickness)) continue
      if (!isStraightContinuation(left, leftRef.end, right, rightRef.end)) continue

      const survivor = pickSurvivor(left, right)
      const absorbed = survivor === left ? right : left
      const joined = joinPair(left, leftRef.end, right, rightRef.end)
      if (wallLengthCm(joined) <= ZERO_LEN_CM) continue

      work = work.filter((wall) => wall.id !== left.id && wall.id !== right.id)
      work.push(joined)
      remaps.push({ fromId: absorbed.id, intoIds: [survivor.id] })
      mergedCount += 1
      merged = true
      break
    }

    if (!merged) break
  }

  return { walls: work, remaps, mergedCount }
}

/** Raster/stempel: alleen a/b/dikte, tijdelijke ids. */
export function mergeStraightLSegments<T extends { a: Point2D; b: Point2D; thickness: number }>(
  segments: readonly T[],
): T[] {
  if (segments.length < 2) return segments.map((seg) => ({ ...seg, a: { ...seg.a }, b: { ...seg.b } }))
  const asWalls: Wall[] = segments.map((seg, index) => ({
    id: `straight-l-${index}`,
    a: { ...seg.a },
    b: { ...seg.b },
    thickness: seg.thickness,
    openings: [],
  }))
  const merged = mergeStraightLJunctions(asWalls).walls
  const byGeom = new Map(asWalls.map((wall, index) => [wall.id, segments[index]!]))
  return merged.map((wall) => {
    const source = byGeom.get(wall.id) ?? segments[0]!
    return {
      ...source,
      a: { ...wall.a },
      b: { ...wall.b },
      thickness: wall.thickness,
    }
  })
}
