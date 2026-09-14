import type { Opening, Wall } from './types'
import { buildLocalOpeningId } from './opening-ids'

export interface OpeningLocation {
  id: string
  wallId: string
  wallIndex: number
  wall: Wall
  openingIndex: number
  opening: Opening
}

export type OpeningDragMoveResult = {
  walls: Wall[]
  openingId: string
}

function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0.5
  return Math.max(0, Math.min(1, t))
}

function cloneWallsForOpenings(walls: Wall[]): Wall[] {
  return walls.map((wall) => ({
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    openings: wall.openings.map((opening) => ({ ...opening })),
  }))
}

export function findOpeningById(walls: Wall[], openingId: string): OpeningLocation | null {
  for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
    const wall = walls[wallIndex]
    for (let openingIndex = 0; openingIndex < wall.openings.length; openingIndex += 1) {
      const opening = wall.openings[openingIndex]
      const wallId = wall.id || `wall-${wallIndex}`
      const id = buildLocalOpeningId(wallId, opening, openingIndex)
      if (id !== openingId) continue
      return {
        id,
        wallId,
        wallIndex,
        wall,
        openingIndex,
        opening,
      }
    }
  }
  return null
}

/**
 * Verplaats opening naar een andere muur (guid/mirrored/… behouden).
 * Zelfde muur → alleen soft-`t` update.
 */
export function moveOpeningToWall(
  walls: Wall[],
  openingId: string,
  targetWallId: string,
  t: number,
): OpeningDragMoveResult | null {
  const located = findOpeningById(walls, openingId)
  if (!located) return null
  const targetIndex = walls.findIndex((wall) => wall.id === targetWallId)
  if (targetIndex < 0) return null

  const softT = clamp01(t)

  if (located.wallId === targetWallId) {
    if (Math.abs(located.opening.t - softT) <= 1e-9) {
      return { walls, openingId }
    }
    const nextWalls = cloneWallsForOpenings(walls)
    const wall = nextWalls[located.wallIndex]
    wall.openings[located.openingIndex] = { ...wall.openings[located.openingIndex], t: softT }
    return { walls: nextWalls, openingId }
  }

  const nextWalls = cloneWallsForOpenings(walls)
  const sourceWall = nextWalls[located.wallIndex]
  const targetWall = nextWalls[targetIndex]
  if (!sourceWall || !targetWall) return null

  const [moved] = sourceWall.openings.splice(located.openingIndex, 1)
  if (!moved) return null
  const placed: Opening = { ...moved, t: softT }
  targetWall.openings.push(placed)
  const newIndex = targetWall.openings.length - 1
  const newId = buildLocalOpeningId(targetWall.id, placed, newIndex)
  return { walls: nextWalls, openingId: newId }
}
