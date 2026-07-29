import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import type { Opening, OpeningType, Point2D, Wall } from '@/core/fml/types'

const MIN_OPENING_WIDTH_CM = 10
const MAX_OPENING_WIDTH_CM = 400
const MIN_OPENING_HEIGHT_CM = 50
const MAX_OPENING_HEIGHT_CM = 500
const MIN_OPENING_SILL_Z_CM = 0
const MAX_OPENING_SILL_Z_CM = 400

export interface OpeningLocation {
  id: string
  wallId: string
  wallIndex: number
  wall: Wall
  openingIndex: number
  opening: Opening
}

export function buildDoorOpeningId(wallId: string, opening: Opening, openingIndex: number): string {
  return `${wallId}-door-${opening.guid ?? openingIndex}`
}

export function buildWindowOpeningId(wallId: string, opening: Opening, openingIndex: number): string {
  return `${wallId}-window-${opening.guid ?? openingIndex}`
}

export function buildOpeningId(wallId: string, opening: Opening, openingIndex: number): string {
  return opening.type === 'window'
    ? buildWindowOpeningId(wallId, opening, openingIndex)
    : buildDoorOpeningId(wallId, opening, openingIndex)
}

function resolveDoorOpeningHeight(opening: Opening): number {
  return Math.round(opening.z_height ?? DEFAULT_FML_DOOR_HEIGHT_CM)
}

function resolveWindowOpeningHeight(opening: Opening): number {
  return Math.round(opening.z_height ?? DEFAULT_FML_WINDOW_HEIGHT_CM)
}

export function resolveWindowSillZ(opening: Opening): number {
  return Math.round(opening.z ?? DEFAULT_FML_WINDOW_SILL_Z_CM)
}

export function resolveOpeningHeight(opening: Opening): number {
  return opening.type === 'window'
    ? resolveWindowOpeningHeight(opening)
    : resolveDoorOpeningHeight(opening)
}

export function clampOpeningWidth(widthCm: number): number {
  if (!Number.isFinite(widthCm)) return MIN_OPENING_WIDTH_CM
  return Math.max(MIN_OPENING_WIDTH_CM, Math.min(MAX_OPENING_WIDTH_CM, Math.round(widthCm)))
}

/** @deprecated Prefer clampOpeningWidth — zelfde clamp voor deur én raam. */
export const clampDoorOpeningWidth = clampOpeningWidth

function clampDoorOpeningHeight(heightCm: number): number {
  if (!Number.isFinite(heightCm)) return DEFAULT_FML_DOOR_HEIGHT_CM
  return Math.max(MIN_OPENING_HEIGHT_CM, Math.min(MAX_OPENING_HEIGHT_CM, Math.round(heightCm)))
}

export function clampWindowOpeningHeight(heightCm: number): number {
  if (!Number.isFinite(heightCm)) return DEFAULT_FML_WINDOW_HEIGHT_CM
  return Math.max(MIN_OPENING_HEIGHT_CM, Math.min(MAX_OPENING_HEIGHT_CM, Math.round(heightCm)))
}

export function clampOpeningHeight(heightCm: number, type: OpeningType): number {
  return type === 'window' ? clampWindowOpeningHeight(heightCm) : clampDoorOpeningHeight(heightCm)
}

export function clampOpeningSillZ(zCm: number): number {
  if (!Number.isFinite(zCm)) return DEFAULT_FML_WINDOW_SILL_Z_CM
  return Math.max(MIN_OPENING_SILL_Z_CM, Math.min(MAX_OPENING_SILL_Z_CM, Math.round(zCm)))
}

export function clampDoorOpeningT(wall: { a: { x: number; y: number }; b: { x: number; y: number } }, widthCm: number, t: number): number {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  if (!Number.isFinite(t) || len < 1e-6) return 0.5
  const half = Math.max(0.5, widthCm / 2)
  const minT = half / len
  const maxT = 1 - half / len
  if (minT > maxT) return 0.5
  return Math.max(minT, Math.min(maxT, t))
}

export function projectPointToWallT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return 0.5
  const tRaw = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / lenSq
  return Math.max(0, Math.min(1, tRaw))
}

export function addOpeningToWall(walls: Wall[], wallId: string, opening: Opening): Wall[] {
  const wallIndex = walls.findIndex((wall) => wall.id === wallId)
  if (wallIndex < 0) return walls
  const wall = walls[wallIndex]!

  const width = Math.max(1, Math.round(opening.width))
  const t = clampDoorOpeningT(wall, width, opening.t)
  const normalized: Opening = {
    ...opening,
    guid: opening.guid ?? crypto.randomUUID(),
    width,
    t,
    z_height:
      opening.type === 'door'
        ? (opening.z_height ?? DEFAULT_FML_DOOR_HEIGHT_CM)
        : (opening.z_height ?? DEFAULT_FML_WINDOW_HEIGHT_CM),
    z: opening.type === 'window' ? (opening.z ?? DEFAULT_FML_WINDOW_SILL_Z_CM) : opening.z,
  }

  const nextWall: Wall = {
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    openings: [...wall.openings.map((item) => ({ ...item })), normalized],
  }
  const nextWalls = [...walls]
  nextWalls[wallIndex] = nextWall
  return nextWalls
}

export function findOpeningById(walls: Wall[], openingId: string): OpeningLocation | null {
  for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
    const wall = walls[wallIndex]!
    for (let openingIndex = 0; openingIndex < wall.openings.length; openingIndex += 1) {
      const opening = wall.openings[openingIndex]!
      const wallId = wall.id || `wall-${wallIndex}`
      const id = buildOpeningId(wallId, opening, openingIndex)
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

type OpeningPatch = Partial<Pick<Opening, 't' | 'width' | 'z' | 'z_height' | 'mirrored'>>

export function updateOpeningById(walls: Wall[], openingId: string, patch: OpeningPatch): Wall[] {
  const located = findOpeningById(walls, openingId)
  if (!located) return walls

  const nextWalls = walls.map((wall) => ({
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
    openings: wall.openings.map((opening) => ({ ...opening })),
  }))
  const nextWall = nextWalls[located.wallIndex]
  if (!nextWall) return walls
  const nextOpening = nextWall.openings[located.openingIndex]
  if (!nextOpening) return walls

  let changed = false

  if (patch.width != null) {
    const width = clampOpeningWidth(patch.width)
    if (nextOpening.width !== width) {
      nextOpening.width = width
      changed = true
    }
  }

  if (patch.z_height != null) {
    const height = clampOpeningHeight(patch.z_height, nextOpening.type)
    if (nextOpening.z_height !== height) {
      nextOpening.z_height = height
      changed = true
    }
  }

  if (patch.z != null && nextOpening.type === 'window') {
    const sillZ = clampOpeningSillZ(patch.z)
    if (nextOpening.z !== sillZ) {
      nextOpening.z = sillZ
      changed = true
    }
  }

  if (patch.mirrored != null && nextOpening.type === 'door') {
    const mirrored: [number, number] = [patch.mirrored[0] === 1 ? 1 : 0, patch.mirrored[1] === 1 ? 1 : 0]
    const current = nextOpening.mirrored ?? [0, 0]
    if (current[0] !== mirrored[0] || current[1] !== mirrored[1]) {
      nextOpening.mirrored = mirrored
      changed = true
    }
  }

  if (patch.t != null) {
    const width = patch.width != null ? clampOpeningWidth(patch.width) : nextOpening.width
    const t = clampDoorOpeningT(nextWall, width, patch.t)
    if (Math.abs(nextOpening.t - t) > 1e-6) {
      nextOpening.t = t
      changed = true
    }
  }

  return changed ? nextWalls : walls
}

export function removeOpeningsById(walls: Wall[], openingIds: Iterable<string>): Wall[] {
  const idSet = new Set(openingIds)
  if (idSet.size === 0) return walls
  let changed = false

  const nextWalls = walls.map((wall, wallIndex) => {
    const wallId = wall.id || `wall-${wallIndex}`
    const openings = wall.openings.filter((opening, openingIndex) => {
      const id = buildOpeningId(wallId, opening, openingIndex)
      const remove = idSet.has(id)
      if (remove) changed = true
      return !remove
    })
    return openings.length === wall.openings.length ? wall : { ...wall, openings }
  })

  return changed ? nextWalls : walls
}

export {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM as DEFAULT_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM as DEFAULT_WINDOW_SILL_Z_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
}
