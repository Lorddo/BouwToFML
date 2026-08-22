import { clampBovenlichtGapCm, clampBovenlichtHeightCm } from '@/core/fml/bovenlicht'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from '@/core/fml/extraction-to-plan-types'
import {
  openingWorldCenter as openingWorldCenterOnAxis,
  projectOpeningT,
} from '@/core/fml/fml-wall-geom'
import { buildLocalOpeningId } from '@/core/fml/opening-ids'
import { findOpeningById, type OpeningLocation } from '@/core/fml/opening-wall-ops'
import type { Opening, OpeningType, Point2D, Wall } from '@/core/fml/types'

export type { OpeningLocation }

const MIN_OPENING_WIDTH_CM = 10
const MAX_OPENING_WIDTH_CM = 400
/** Kozijn-rondom; ook ventilatierooster (~10 cm). */
export const MIN_OPENING_HEIGHT_CM = 10
const MAX_OPENING_HEIGHT_CM = 500
const MIN_OPENING_SILL_Z_CM = 0
const MAX_OPENING_SILL_Z_CM = 400

export function buildDoorOpeningId(wallId: string, opening: Opening, openingIndex: number): string {
  return buildLocalOpeningId(wallId, { ...opening, type: 'door' }, openingIndex)
}

export function buildWindowOpeningId(
  wallId: string,
  opening: Opening,
  openingIndex: number,
): string {
  return buildLocalOpeningId(wallId, { ...opening, type: 'window' }, openingIndex)
}

export function buildOpeningId(wallId: string, opening: Opening, openingIndex: number): string {
  return buildLocalOpeningId(wallId, opening, openingIndex)
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

export type OpeningCollinearEnds = { a: boolean; b: boolean }

const COLLINEAR_DOT = 0.99
const ENDPOINT_EPS_CM = 0.05

function wallAxisUnit(wall: Pick<Wall, 'a' | 'b'>): Point2D | null {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  return { x: dx / len, y: dy / len }
}

function sameEndpoint(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) <= ENDPOINT_EPS_CM && Math.abs(a.y - b.y) <= ENDPOINT_EPS_CM
}

function wallsCollinearNeighbors(a: Pick<Wall, 'a' | 'b'>, b: Pick<Wall, 'a' | 'b'>): boolean {
  const ua = wallAxisUnit(a)
  const ub = wallAxisUnit(b)
  if (!ua || !ub) return false
  if (Math.abs(ua.x * ub.x + ua.y * ub.y) < COLLINEAR_DOT) return false
  return (
    sameEndpoint(a.a, b.a) ||
    sameEndpoint(a.a, b.b) ||
    sameEndpoint(a.b, b.a) ||
    sameEndpoint(a.b, b.b)
  )
}

/** Collineaire buur op een einde: daar mag een opening op de naad (zoals 2D-hop). */
export function wallCollinearEnds(
  walls: readonly Pick<Wall, 'id' | 'a' | 'b'>[],
  wallId: string,
): OpeningCollinearEnds {
  const wall = walls.find((item) => item.id === wallId)
  if (!wall) return { a: false, b: false }
  let a = false
  let b = false
  for (const other of walls) {
    if (other.id === wallId || !wallsCollinearNeighbors(wall, other)) continue
    if (sameEndpoint(wall.a, other.a) || sameEndpoint(wall.a, other.b)) a = true
    if (sameEndpoint(wall.b, other.a) || sameEndpoint(wall.b, other.b)) b = true
  }
  return { a, b }
}

export function collectCollinearWallIds(
  walls: readonly Pick<Wall, 'id' | 'a' | 'b'>[],
  startId: string,
): string[] {
  const ids = new Set<string>([startId])
  const list = [...walls]
  let grew = true
  while (grew) {
    grew = false
    for (const id of [...ids]) {
      const wall = list.find((item) => item.id === id)
      if (!wall) continue
      for (const other of list) {
        if (ids.has(other.id) || !wallsCollinearNeighbors(wall, other)) continue
        ids.add(other.id)
        grew = true
      }
    }
  }
  return [...ids]
}

export function clampDoorOpeningT(
  wall: { a: { x: number; y: number }; b: { x: number; y: number }; thickness?: number },
  widthCm: number,
  t: number,
  ends?: OpeningCollinearEnds,
): number {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  if (!Number.isFinite(t) || len < 1e-6) return 0.5
  const half = Math.max(0.5, widthCm / 2)
  const cap = Math.max(0, (wall.thickness ?? 0) / 2)
  const minT = ends?.a ? 0 : (half - cap) / len
  const maxT = ends?.b ? 1 : 1 - (half - cap) / len
  if (minT > maxT) return 0.5
  return Math.max(minT, Math.min(maxT, t))
}

export function projectPointToWallT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const lenSq = dx * dx + dy * dy
  // Editor: degeneraat → midden; core sanitize gebruikt 0 via projectOpeningT.
  if (lenSq < 1e-9) return 0.5
  return projectOpeningT(wall, point)
}

/** Wereldpositie van het openingscentrum op de muur (parameter `t`). */
export function openingWorldCenter(wall: Pick<Wall, 'a' | 'b'>, t: number): Point2D {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5))
  return openingWorldCenterOnAxis(wall, clamped)
}

/**
 * Herbereken `t` zodat de opening op dezelfde wereldpositie blijft na een
 * muurgeometrie-wijziging (split / knooppunt-verslepen).
 * Geen breedte-clamp: anders schuiven te brede openingen mee i.p.v. vast te blijven.
 */
export function reprojectOpeningT(wall: Pick<Wall, 'a' | 'b'>, worldCenter: Point2D): number {
  return projectPointToWallT(wall, worldCenter)
}

/** Herprojecteer alle openingen van een muur vanuit vastgelegde wereldcentra. */
export function reprojectWallOpenings(wall: Wall, worldCenters: readonly Point2D[]): Opening[] {
  return wall.openings.map((opening, index) => {
    const world = worldCenters[index] ?? openingWorldCenter(wall, opening.t)
    const t = reprojectOpeningT(wall, world)
    return Math.abs(opening.t - t) > 1e-9 ? { ...opening, t } : opening
  })
}

/**
 * Verdeel openingen over twee split-segmenten en herbereken `t` naar de
 * oorspronkelijke wereldpositie op het nieuwe segment.
 */
export function redistributeOpeningsAcrossSplit(params: {
  openings: readonly Opening[]
  sourceWall: Pick<Wall, 'a' | 'b'>
  tSplit: number
  firstWall: Pick<Wall, 'a' | 'b'>
  secondWall: Pick<Wall, 'a' | 'b'>
}): { first: Opening[]; second: Opening[] } {
  const first: Opening[] = []
  const second: Opening[] = []
  for (const opening of params.openings) {
    const world = openingWorldCenter(params.sourceWall, opening.t)
    if (opening.t <= params.tSplit) {
      first.push({
        ...opening,
        t: reprojectOpeningT(params.firstWall, world),
      })
    } else {
      second.push({
        ...opening,
        t: reprojectOpeningT(params.secondWall, world),
      })
    }
  }
  return { first, second }
}

export function addOpeningToWall(walls: Wall[], wallId: string, opening: Opening): Wall[] {
  const wallIndex = walls.findIndex((wall) => wall.id === wallId)
  if (wallIndex < 0) return walls
  const wall = walls[wallIndex]

  const width = Math.max(1, Math.round(opening.width))
  const t = clampDoorOpeningT(wall, width, opening.t, wallCollinearEnds(walls, wallId))
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

export { findOpeningById }

type OpeningPatch = Partial<
  Pick<
    Opening,
    | 't'
    | 'width'
    | 'z'
    | 'z_height'
    | 'mirrored'
    | 'bovenlicht'
    | 'bovenlichtHeightCm'
    | 'bovenlichtGapCm'
    | 'refid'
  >
>

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

  if (patch.refid != null && patch.refid !== '' && nextOpening.refid !== patch.refid) {
    nextOpening.refid = patch.refid
    changed = true
  }

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

  if (patch.mirrored != null && (nextOpening.type === 'door' || nextOpening.type === 'window')) {
    const mirrored: [number, number] = [
      patch.mirrored[0] === 1 ? 1 : 0,
      patch.mirrored[1] === 1 ? 1 : 0,
    ]
    const current = nextOpening.mirrored ?? [0, 0]
    if (current[0] !== mirrored[0] || current[1] !== mirrored[1]) {
      nextOpening.mirrored = mirrored
      changed = true
    }
  }

  if (
    patch.bovenlicht !== undefined &&
    (nextOpening.type === 'door' || nextOpening.type === 'window')
  ) {
    const next = patch.bovenlicht
    if (nextOpening.bovenlicht !== next) {
      nextOpening.bovenlicht = next
      changed = true
    }
  }

  if (
    patch.bovenlichtHeightCm !== undefined &&
    (nextOpening.type === 'door' || nextOpening.type === 'window')
  ) {
    const next =
      patch.bovenlichtHeightCm == null ? null : clampBovenlichtHeightCm(patch.bovenlichtHeightCm)
    if (nextOpening.bovenlichtHeightCm !== next) {
      nextOpening.bovenlichtHeightCm = next
      changed = true
    }
  }

  if (
    patch.bovenlichtGapCm !== undefined &&
    (nextOpening.type === 'door' || nextOpening.type === 'window')
  ) {
    const next = patch.bovenlichtGapCm == null ? null : clampBovenlichtGapCm(patch.bovenlichtGapCm)
    if (nextOpening.bovenlichtGapCm !== next) {
      nextOpening.bovenlichtGapCm = next
      changed = true
    }
  }

  if (patch.t != null) {
    const width = patch.width != null ? clampOpeningWidth(patch.width) : nextOpening.width
    const t = clampDoorOpeningT(nextWall, width, patch.t, wallCollinearEnds(nextWalls, nextWall.id))
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
