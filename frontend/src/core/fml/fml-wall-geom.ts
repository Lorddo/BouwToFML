import type { Wall } from './types'

/** Hartlijnlengte in cm (Floorplanner-ruimte). */
export function wallLengthCm(wall: Pick<Wall, 'a' | 'b'>): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
}

export function totalWallLengthCm(walls: Array<Pick<Wall, 'a' | 'b'>>): number {
  let total = 0
  for (const wall of walls) total += wallLengthCm(wall)
  return total
}
