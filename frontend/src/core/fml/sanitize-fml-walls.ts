/**
 * FML wall sanitize (cm): weld near endpoints → near-H/V exact op as →
 * T/X junctions → collinear cover (muur-onder-muur), herhaald tot stabiel.
 *
 * Keep-axis: alleen `a`/`b` (en splits); `balance` / `thickness` / extras blijven
 * van de overlever. Geen `alignWallJunctionBalance` (die wist import-balance).
 */
import { classifyNearAxisWall, orthogonalizeNearAxisWalls } from './orthogonalize-near-axis-walls'
import {
  openingWorldCenter,
  projectOpeningT,
  reprojectWallOpenings,
  wallLengthCm,
} from './fml-wall-geom'
import type { WallIdRemap } from './facade-groups'
import { materializeWallJunctionsDetailed } from './materialize-wall-junctions'
import type { Opening, Point2D, Wall } from './types'
import { splitWallEndpointExtras } from './wall-endpoint-height'

/** Import-knoopjes die 1 mm uit elkaar liggen → één punt. */
export const SANITIZE_WELD_EPS_CM = 0.25

/** Hartlijnen binnen dit (cm) tellen als dezelfde as (niet dikte — gang blijft). */
export const SANITIZE_AXIS_CLUSTER_EPS_CM = 0.5

/** Max weld→ortho→T/X→cover-passen tot vast punt (ortho kan nieuwe welds maken). */
export const SANITIZE_MAX_PASSES = 4

const SPAN_SLACK_CM = 0.05
const MIN_SPLIT_T = 1e-6
const MIN_DIR_CM = 1e-9
const COORD_EPS_CM = 1e-9

type AxisKind = 'H' | 'V'

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

function newSplitId(sourceId: string): string {
  return `sanitize-${sourceId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`
}

function weldNearEndpoints(walls: Wall[]): Wall[] {
  if (walls.length === 0) return walls
  const work = walls.map(cloneWall)
  type Ep = { wallIndex: number; end: 'a' | 'b'; x: number; y: number }
  const eps: Ep[] = []
  for (let i = 0; i < work.length; i += 1) {
    eps.push({ wallIndex: i, end: 'a', x: work[i].a.x, y: work[i].a.y })
    eps.push({ wallIndex: i, end: 'b', x: work[i].b.x, y: work[i].b.y })
  }

  const parent = eps.map((_, i) => i)
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i])
    return parent[i]
  }
  const union = (a: number, b: number): void => {
    parent[find(b)] = find(a)
  }

  for (let i = 0; i < eps.length; i += 1) {
    for (let j = i + 1; j < eps.length; j += 1) {
      if (eps[i].wallIndex === eps[j].wallIndex) continue
      const d = Math.hypot(eps[i].x - eps[j].x, eps[i].y - eps[j].y)
      if (d <= SANITIZE_WELD_EPS_CM) union(i, j)
    }
  }

  const clusters = new Map<number, number[]>()
  for (let i = 0; i < eps.length; i += 1) {
    const root = find(i)
    const list = clusters.get(root) ?? []
    list.push(i)
    clusters.set(root, list)
  }

  const moved = new Set<number>()
  for (const members of clusters.values()) {
    if (members.length < 2) continue
    let sx = 0
    let sy = 0
    for (const idx of members) {
      sx += eps[idx].x
      sy += eps[idx].y
    }
    const x = sx / members.length
    const y = sy / members.length
    for (const idx of members) {
      const ep = eps[idx]
      const wall = work[ep.wallIndex]
      const next = { x, y }
      const prev = wall[ep.end]
      if (Math.abs(prev.x - next.x) <= COORD_EPS_CM && Math.abs(prev.y - next.y) <= COORD_EPS_CM) {
        continue
      }
      moved.add(ep.wallIndex)
      wall[ep.end] = next
    }
  }

  for (const idx of moved) {
    const wall = work[idx]
    if (wallLengthCm(wall) <= MIN_DIR_CM) continue
    const centers = wall.openings.map((opening) => openingWorldCenter(walls[idx], opening.t))
    wall.openings = reprojectWallOpenings(wall, centers)
  }

  return work
}

function alongSpan(wall: Wall, axis: AxisKind): { lo: number; hi: number } {
  if (axis === 'V') {
    return { lo: Math.min(wall.a.y, wall.b.y), hi: Math.max(wall.a.y, wall.b.y) }
  }
  return { lo: Math.min(wall.a.x, wall.b.x), hi: Math.max(wall.a.x, wall.b.x) }
}

function axisValueOf(wall: Wall, axis: AxisKind): number {
  return axis === 'H' ? (wall.a.y + wall.b.y) / 2 : (wall.a.x + wall.b.x) / 2
}

function alongCoord(point: Point2D, axis: AxisKind): number {
  return axis === 'V' ? point.y : point.x
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i += 1) {
    const [lo, hi] = sorted[i]
    const last = out[out.length - 1]
    if (lo <= last[1] + SPAN_SLACK_CM) {
      last[1] = Math.max(last[1], hi)
    } else {
      out.push([lo, hi])
    }
  }
  return out
}

function spanCoveredByUnion(
  lo: number,
  hi: number,
  union: Array<[number, number]>,
  slack: number,
): boolean {
  if (hi - lo <= slack) {
    return union.some(([ulo, uhi]) => lo >= ulo - slack && lo <= uhi + slack)
  }
  let cursor = lo
  for (const [ulo, uhi] of union) {
    if (uhi + slack < cursor) continue
    if (ulo - slack > cursor) return false
    cursor = Math.max(cursor, uhi)
    if (cursor + slack >= hi) return true
  }
  return cursor + slack >= hi
}

function pointNear(a: Point2D, b: Point2D, eps: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps
}

function splitPointOnAxis(wall: Wall, axis: AxisKind, along: number): Point2D {
  return axis === 'H'
    ? { x: along, y: axisValueOf(wall, 'H') }
    : { x: axisValueOf(wall, 'V'), y: along }
}

function splitWallAtAlong(
  wall: Wall,
  axis: AxisKind,
  along: number,
): { walls: Wall[]; remap: WallIdRemap } | null {
  const span = alongSpan(wall, axis)
  if (along <= span.lo + SPAN_SLACK_CM || along >= span.hi - SPAN_SLACK_CM) return null
  const t = projectOpeningT(wall, splitPointOnAxis(wall, axis, along))
  if (t <= MIN_SPLIT_T || t >= 1 - MIN_SPLIT_T) return null

  const split = splitPointOnAxis(wall, axis, along)
  const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
  const firstGeom = { a: wall.a, b: split }
  const secondGeom = { a: split, b: wall.b }
  const firstOpenings: Opening[] = []
  const secondOpenings: Opening[] = []
  for (let i = 0; i < wall.openings.length; i += 1) {
    const center = centers[i]
    const opening = cloneOpening(wall.openings[i])
    if (alongCoord(center, axis) <= along + SPAN_SLACK_CM) {
      firstOpenings.push({ ...opening, t: projectOpeningT(firstGeom, center) })
    } else {
      secondOpenings.push({ ...opening, t: projectOpeningT(secondGeom, center) })
    }
  }
  const { firstExtras, secondExtras } = splitWallEndpointExtras(wall, t)
  const newId = newSplitId(wall.id)
  return {
    walls: [
      {
        ...wall,
        b: { ...split },
        openings: firstOpenings,
        extras: firstExtras,
      },
      {
        ...wall,
        id: newId,
        a: { ...split },
        openings: secondOpenings,
        extras: secondExtras,
      },
    ],
    remap: { fromId: wall.id, intoIds: [wall.id, newId] },
  }
}

function findCoverHost(hosts: Wall[], point: Point2D, axis: AxisKind): Wall | null {
  let best: Wall | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const host of hosts) {
    const t = projectOpeningT(host, point)
    const on = {
      x: host.a.x + t * (host.b.x - host.a.x),
      y: host.a.y + t * (host.b.y - host.a.y),
    }
    const span = alongSpan(host, axis)
    const along = alongCoord(point, axis)
    if (along < span.lo - SPAN_SLACK_CM || along > span.hi + SPAN_SLACK_CM) continue
    const dist = Math.hypot(point.x - on.x, point.y - on.y)
    if (dist < bestDist) {
      bestDist = dist
      best = host
    }
  }
  return best
}

/**
 * Muur volledig onder een collineaire buur → slachtoffer weg; host knipt op
 * uitstekende einden. Live slide/junction-move gebruikt dit om T-tak-voorbij-stam
 * geen dubbele muur te laten bakken.
 */
export function absorbCoveredCollinearWalls(
  walls: Wall[],
  options?: { keepIds?: ReadonlySet<string> },
): {
  walls: Wall[]
  remaps: WallIdRemap[]
} {
  let work = walls.map(cloneWall)
  const remaps: WallIdRemap[] = []
  let guard = 0
  while (guard < work.length + 8) {
    guard += 1
    const kinds: Array<AxisKind | null> = work.map((wall) => classifyNearAxisWall(wall))
    const clusters = new Map<string, { axis: AxisKind; axisValue: number; indices: number[] }>()

    for (let i = 0; i < work.length; i += 1) {
      const axis = kinds[i]
      if (axis == null) continue
      if (wallLengthCm(work[i]) <= SPAN_SLACK_CM) continue
      const value = axisValueOf(work[i], axis)
      let key: string | null = null
      for (const [existingKey, cluster] of clusters) {
        if (cluster.axis !== axis) continue
        if (Math.abs(cluster.axisValue - value) <= SANITIZE_AXIS_CLUSTER_EPS_CM) {
          key = existingKey
          break
        }
      }
      if (key) {
        clusters.get(key)!.indices.push(i)
      } else {
        clusters.set(`${axis}:${value}:${i}`, { axis, axisValue: value, indices: [i] })
      }
    }

    type Victim = { index: number; axis: AxisKind; clusterIndices: number[] }
    const victims: Victim[] = []
    for (const cluster of clusters.values()) {
      if (cluster.indices.length < 2) continue
      const spans = cluster.indices.map((index) => {
        const span = alongSpan(work[index], cluster.axis)
        return { index, lo: span.lo, hi: span.hi }
      })
      for (const candidate of spans) {
        if (options?.keepIds?.has(work[candidate.index].id)) continue
        const others = spans
          .filter((s) => s.index !== candidate.index)
          .map((s): [number, number] => [s.lo, s.hi])
        if (
          !spanCoveredByUnion(candidate.lo, candidate.hi, mergeIntervals(others), SPAN_SLACK_CM)
        ) {
          continue
        }
        victims.push({
          index: candidate.index,
          axis: cluster.axis,
          clusterIndices: cluster.indices,
        })
      }
    }

    if (victims.length === 0) break

    victims.sort((a, b) => {
      const len = wallLengthCm(work[a.index]) - wallLengthCm(work[b.index])
      if (Math.abs(len) > 1e-6) return len
      const thick = work[a.index].thickness - work[b.index].thickness
      if (Math.abs(thick) > 1e-6) return thick
      return work[a.index].id.localeCompare(work[b.index].id)
    })
    const victim = victims[0]
    const victimWall = work[victim.index]

    const uniqueEnds: Point2D[] = []
    for (const ep of [victimWall.a, victimWall.b]) {
      const shared = victim.clusterIndices.some((idx) => {
        if (idx === victim.index) return false
        return (
          pointNear(work[idx].a, ep, SANITIZE_WELD_EPS_CM) ||
          pointNear(work[idx].b, ep, SANITIZE_WELD_EPS_CM)
        )
      })
      if (!shared) uniqueEnds.push(ep)
    }

    const next: Wall[] = []
    for (let i = 0; i < work.length; i += 1) {
      if (i === victim.index) continue
      let pieces = [work[i]]
      if (victim.clusterIndices.includes(i)) {
        for (const ep of uniqueEnds) {
          const along = alongCoord(ep, victim.axis)
          const rebuilt: Wall[] = []
          for (const piece of pieces) {
            const split = splitWallAtAlong(piece, victim.axis, along)
            if (split) {
              remaps.push(split.remap)
              rebuilt.push(...split.walls)
            } else {
              rebuilt.push(piece)
            }
          }
          pieces = rebuilt
        }
      }
      next.push(...pieces)
    }

    const hosts = next.filter((wall) => classifyNearAxisWall(wall) === victim.axis)
    for (const opening of victimWall.openings) {
      const center = openingWorldCenter(victimWall, opening.t)
      const host = findCoverHost(hosts, center, victim.axis)
      if (!host) continue
      host.openings.push({
        ...cloneOpening(opening),
        t: projectOpeningT(host, center),
      })
    }

    work = next
  }

  return {
    walls: work.filter((wall) => wallLengthCm(wall) > SPAN_SLACK_CM),
    remaps,
  }
}

/** True als sanitize geometrie of muur-set wijzigde (voor undo-skip). */
export function wallsSanitizeChanged(before: Wall[], after: Wall[]): boolean {
  if (before.length !== after.length) return true
  const byId = new Map(after.map((wall) => [wall.id, wall]))
  for (const wall of before) {
    const next = byId.get(wall.id)
    if (!next) return true
    if (
      Math.abs(next.a.x - wall.a.x) > COORD_EPS_CM ||
      Math.abs(next.a.y - wall.a.y) > COORD_EPS_CM ||
      Math.abs(next.b.x - wall.b.x) > COORD_EPS_CM ||
      Math.abs(next.b.y - wall.b.y) > COORD_EPS_CM
    ) {
      return true
    }
    if (next.openings.length !== wall.openings.length) return true
  }
  return false
}

/**
 * Weld → orthogonalize → T/X junctions → cover, herhaald tot geometrie stabiel is.
 * `balance` van elke overlevende muur blijft.
 * Remaps: host-helften op dezelfde as (T/X + cover); uitstekende T-tak niet.
 */
export type SanitizeFmlWallsResult = {
  walls: Wall[]
  remaps: WallIdRemap[]
}

function runSanitizePass(walls: Wall[]): SanitizeFmlWallsResult {
  const welded = weldNearEndpoints(walls)
  const ortho = orthogonalizeNearAxisWalls(welded)
  const junctions = materializeWallJunctionsDetailed(ortho)
  const cover = absorbCoveredCollinearWalls(junctions.walls)
  return {
    walls: cover.walls,
    remaps: [...junctions.remaps, ...cover.remaps],
  }
}

export function sanitizeFmlWallsDetailed(walls: Wall[]): SanitizeFmlWallsResult {
  if (walls.length === 0) return { walls, remaps: [] }
  let current = walls
  const remaps: WallIdRemap[] = []
  for (let pass = 0; pass < SANITIZE_MAX_PASSES; pass += 1) {
    const next = runSanitizePass(current)
    remaps.push(...next.remaps)
    if (!wallsSanitizeChanged(current, next.walls)) {
      return { walls: next.walls, remaps }
    }
    current = next.walls
  }
  return { walls: current, remaps }
}

export function sanitizeFmlWalls(walls: Wall[]): Wall[] {
  return sanitizeFmlWallsDetailed(walls).walls
}
