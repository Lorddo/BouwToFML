/**
 * T- en X-junctions materialiseren: host knippen zodat Floorplanner geen
 * nieuwe 6-hex-GUIDs hoeft te maken.
 *
 * T: muureindpunt op het binnenste van een andere hartlijn → host knippen.
 * X: resterende interior-kruisingen → beide knippen.
 * Eerste helft houdt de oude `id`; tweede = `split-host-` + 8 hex.
 *
 * Gevelgroepen: alleen de geknipte host wordt geremapt (zelfde as);
 * de uitstekende T-tak houdt zijn id en komt niet in de host-groep.
 */
import { ensureDesignsSynced } from './design-sync'
import { applyFacadeGroupRemaps, pruneFacadeGroups, type WallIdRemap } from './facade-groups'
import type { Floor, FloorPlan, Opening, Point2D, Wall } from './types'
import { splitWallEndpointExtras } from './wall-endpoint-height'

/** Eindpunt ligt op een hartlijn (cm); gelijk aan sanitize-weld. */
export const JUNCTION_ON_AXIS_EPS_CM = 0.25

/** Parameter ε: t≈0/1 is al een knoop, geen split. Geen 4 cm min-segment. */
const PARAM_EPS = 1e-4
const MIN_SPLIT_T = 1e-6
const MIN_DIR_CM = 1e-9

export type MaterializeWallJunctionsResult = {
  walls: Wall[]
  remaps: WallIdRemap[]
  changed: boolean
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
    extras: wall.extras ? { ...wall.extras } : undefined,
  }
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pointAtT(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

function openingWorldCenter(wall: Pick<Wall, 'a' | 'b'>, t: number): Point2D {
  return pointAtT(wall.a, wall.b, t)
}

function projectT(wall: Pick<Wall, 'a' | 'b'>, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return 0
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
  return Math.max(0, Math.min(1, t))
}

function pointParamOnSegment(a: Point2D, b: Point2D, point: Point2D, epsCm: number): number | null {
  const ab = { x: b.x - a.x, y: b.y - a.y }
  const lenSq = ab.x * ab.x + ab.y * ab.y
  if (lenSq < 1e-9) return null
  const t = ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / lenSq
  if (t < -epsCm || t > 1 + epsCm) return null
  const projection = { x: a.x + t * ab.x, y: a.y + t * ab.y }
  if (distance(point, projection) > epsCm) return null
  return Math.max(0, Math.min(1, t))
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

function segmentIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
  eps = JUNCTION_ON_AXIS_EPS_CM,
): { t: number; u: number; point: Point2D } | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y }
  const s = { x: b2.x - b1.x, y: b2.y - b1.y }
  const denom = cross2(r.x, r.y, s.x, s.y)
  if (Math.abs(denom) <= eps) return null
  const qp = { x: b1.x - a1.x, y: b1.y - a1.y }
  const t = cross2(qp.x, qp.y, s.x, s.y) / denom
  const u = cross2(qp.x, qp.y, r.x, r.y) / denom
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null
  return { t, u, point: pointAtT(a1, a2, t) }
}

function newSplitId(): string {
  return `split-host-${crypto.randomUUID().slice(0, 8)}`
}

function reprojectOpenings(wall: Wall, worldCenters: Point2D[]): void {
  wall.openings = wall.openings.map((opening, index) => ({
    ...opening,
    t: projectT(wall, worldCenters[index] ?? openingWorldCenter(wall, opening.t)),
  }))
}

function redistributeOpenings(
  source: Pick<Wall, 'a' | 'b' | 'openings'>,
  tSplit: number,
  first: Pick<Wall, 'a' | 'b'>,
  second: Pick<Wall, 'a' | 'b'>,
): { first: Opening[]; second: Opening[] } {
  const firstOpenings: Opening[] = []
  const secondOpenings: Opening[] = []
  for (const opening of source.openings) {
    const world = openingWorldCenter(source, opening.t)
    const copy = cloneOpening(opening)
    // Exact op de knip: één helft (eerste); wereldpositie blijft.
    if (opening.t <= tSplit) {
      firstOpenings.push({ ...copy, t: projectT(first, world) })
    } else {
      secondOpenings.push({ ...copy, t: projectT(second, world) })
    }
  }
  return { first: firstOpenings, second: secondOpenings }
}

function splitWallAt(
  walls: Wall[],
  wall: Wall,
  splitPoint: Point2D,
  tSplit: number,
  remaps: WallIdRemap[],
): boolean {
  if (tSplit <= MIN_SPLIT_T || tSplit >= 1 - MIN_SPLIT_T) return false
  const wallIndex = walls.findIndex((item) => item.id === wall.id)
  if (wallIndex < 0) return false
  const firstGeom = { a: wall.a, b: splitPoint }
  const secondGeom = { a: splitPoint, b: wall.b }
  if (distance(firstGeom.a, firstGeom.b) <= MIN_DIR_CM) return false
  if (distance(secondGeom.a, secondGeom.b) <= MIN_DIR_CM) return false
  const { first: firstOpenings, second: secondOpenings } = redistributeOpenings(
    wall,
    tSplit,
    firstGeom,
    secondGeom,
  )
  const { firstExtras, secondExtras } = splitWallEndpointExtras(wall, tSplit)
  const newId = newSplitId()
  walls.splice(
    wallIndex,
    1,
    {
      ...wall,
      b: { ...splitPoint },
      openings: firstOpenings,
      extras: firstExtras,
    },
    {
      ...wall,
      id: newId,
      a: { ...splitPoint },
      openings: secondOpenings,
      extras: secondExtras,
    },
  )
  remaps.push({ fromId: wall.id, intoIds: [wall.id, newId] })
  return true
}

function snapEndpointTo(walls: Wall[], wallId: string, end: 'a' | 'b', point: Point2D): void {
  const wall = walls.find((item) => item.id === wallId)
  if (!wall) return
  if (distance(wall[end], point) <= 1e-12) return
  const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
  wall[end] = { ...point }
  reprojectOpenings(wall, centers)
}

function materializeTJoins(walls: Wall[], remaps: WallIdRemap[]): boolean {
  let changed = false
  const max = Math.max(8, walls.length * walls.length + 8)
  for (let guard = 0; guard < max; guard += 1) {
    let split = false
    for (const wall of [...walls]) {
      for (const end of ['a', 'b'] as const) {
        const point = wall[end]
        for (const host of [...walls]) {
          if (host.id === wall.id) continue
          const t = pointParamOnSegment(host.a, host.b, point, JUNCTION_ON_AXIS_EPS_CM)
          if (t == null || t <= PARAM_EPS || t >= 1 - PARAM_EPS) continue
          const projected = pointAtT(host.a, host.b, t)
          snapEndpointTo(walls, wall.id, end, projected)
          const hostRef = walls.find((item) => item.id === host.id)
          if (hostRef && splitWallAt(walls, hostRef, projected, t, remaps)) {
            split = true
            changed = true
            break
          }
        }
        if (split) break
      }
      if (split) break
    }
    if (!split) break
  }
  return changed
}

function materializeXCrossings(walls: Wall[], remaps: WallIdRemap[]): boolean {
  let changed = false
  const max = Math.max(8, walls.length * walls.length + 8)
  for (let guard = 0; guard < max; guard += 1) {
    let split = false
    for (let i = 0; i < walls.length; i += 1) {
      for (let j = i + 1; j < walls.length; j += 1) {
        const left = walls[i]
        const right = walls[j]
        const hit = segmentIntersection(left.a, left.b, right.a, right.b)
        if (!hit) continue
        if (hit.t <= PARAM_EPS || hit.t >= 1 - PARAM_EPS) continue
        if (hit.u <= PARAM_EPS || hit.u >= 1 - PARAM_EPS) continue
        const leftRef = walls.find((item) => item.id === left.id)
        if (leftRef) {
          const tLeft = pointParamOnSegment(
            leftRef.a,
            leftRef.b,
            hit.point,
            JUNCTION_ON_AXIS_EPS_CM,
          )
          if (
            tLeft != null &&
            tLeft > PARAM_EPS &&
            tLeft < 1 - PARAM_EPS &&
            splitWallAt(walls, leftRef, hit.point, tLeft, remaps)
          ) {
            changed = true
            split = true
          }
        }
        const rightRef = walls.find((item) => item.id === right.id)
        if (rightRef) {
          const tRight = pointParamOnSegment(
            rightRef.a,
            rightRef.b,
            hit.point,
            JUNCTION_ON_AXIS_EPS_CM,
          )
          if (
            tRight != null &&
            tRight > PARAM_EPS &&
            tRight < 1 - PARAM_EPS &&
            splitWallAt(walls, rightRef, hit.point, tRight, remaps)
          ) {
            changed = true
            split = true
          }
        }
        if (split) break
      }
      if (split) break
    }
    if (!split) break
  }
  return changed
}

/** T daarna X, met gevel-remap-lijst (host-helften op dezelfde as). */
export function materializeWallJunctionsDetailed(walls: Wall[]): MaterializeWallJunctionsResult {
  if (walls.length < 2) {
    return { walls, remaps: [], changed: false }
  }
  const work = walls.map(cloneWall)
  const remaps: WallIdRemap[] = []
  const didT = materializeTJoins(work, remaps)
  const didX = materializeXCrossings(work, remaps)
  if (!didT && !didX) return { walls, remaps: [], changed: false }
  return { walls: work, remaps, changed: true }
}

/** T daarna X. Tweede run is no-op (zelfde referenties). */
export function materializeWallJunctions(walls: Wall[]): Wall[] {
  return materializeWallJunctionsDetailed(walls).walls
}

type FloorJunctionResult = { floor: Floor; remaps: WallIdRemap[] }

function applyJunctionsToFloor(floor: Floor): FloorJunctionResult {
  if (floor.designs && floor.designs.length > 0) {
    const synced = ensureDesignsSynced(floor)
    let any = false
    const remaps: WallIdRemap[] = []
    const nextDesigns = (synced.designs ?? []).map((design) => {
      const detailed = materializeWallJunctionsDetailed(design.walls)
      if (detailed.changed) {
        any = true
        remaps.push(...detailed.remaps)
      }
      return detailed.changed ? { ...design, walls: detailed.walls } : design
    })
    if (!any) return { floor, remaps: [] }
    const idx = synced.activeDesignIndex ?? 0
    return {
      floor: {
        ...synced,
        designs: nextDesigns,
        walls: nextDesigns[idx]?.walls ?? synced.walls,
      },
      remaps,
    }
  }
  const detailed = materializeWallJunctionsDetailed(floor.walls)
  if (!detailed.changed) return { floor, remaps: [] }
  return {
    floor: { ...floor, walls: detailed.walls },
    remaps: detailed.remaps,
  }
}

/**
 * Alleen T/X — geen weld/ortho/cover. Remapt gevelgroepen voor host-splits;
 * prune wees-IDs. No-op geeft dezelfde `plan`-referentie.
 */
export function applyJunctionSanitizeToPlan(plan: FloorPlan): FloorPlan {
  let changed = false
  const allRemaps: WallIdRemap[] = []
  const floors = plan.floors.map((floor) => {
    const { floor: next, remaps } = applyJunctionsToFloor(floor)
    if (next !== floor) changed = true
    allRemaps.push(...remaps)
    return next
  })
  if (!changed) return plan
  const nextPlan: FloorPlan = { ...plan, floors }
  applyFacadeGroupRemaps(nextPlan, allRemaps)
  pruneFacadeGroups(nextPlan)
  return nextPlan
}
