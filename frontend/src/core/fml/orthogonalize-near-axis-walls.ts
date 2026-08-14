/**
 * Late FML pass: near-H/V restjitter → exacte as (a.y===b.y / a.x===b.x).
 *
 * Na px→cm + junction-cluster + thickness/balance. Hoek < 1,5° (onder oblique-
 * dodezone 2,5°); echte schuine gevels blijven met rust. Knoop-gewijs zodat
 * L/T (Vx, Hy) blijft en viewer/export dezelfde coords delen.
 *
 * Conflicterende bevroren ankers op één H/V-keten: geen half-snap (voorkomt
 * dat een rechte muur schever wordt). Alleen snappen als de keten één as heeft.
 */
import type { Point2D } from './extraction-to-plan-geom'
import { wallLengthCm } from './fml-wall-geom'
import type { Opening, Wall } from './types'

/** Near-ortho max afwijking t.o.v. H/V — strak onder OBLIQUE_DEADZONE_DEG (2,5°). */
export const NEAR_ORTHO_MAX_DEG = 1.5

const ENDPOINT_KEY_DECIMALS = 4
const AXIS_EPS_CM = 1e-6

type AxisKind = 'H' | 'V'

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

function openingWorldCenter(wall: Wall, t: number): Point2D {
  return {
    x: wall.a.x + t * (wall.b.x - wall.a.x),
    y: wall.a.y + t * (wall.b.y - wall.a.y),
  }
}

function projectT(wall: Wall, point: Point2D): number {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return 0
  const t = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / len2
  return Math.max(0, Math.min(1, t))
}

function reprojectOpenings(wall: Wall, worldCenters: Point2D[]): Opening[] {
  return wall.openings.map((opening, index) => ({
    ...opening,
    t: projectT(wall, worldCenters[index] ?? openingWorldCenter(wall, opening.t)),
  }))
}

/** Kleinste hoek tot H (0°/180°) of V (90°). */
export function offAxisDeg(angleDeg: number): number {
  const normalized = ((angleDeg % 180) + 180) % 180
  return Math.min(normalized, 180 - normalized, Math.abs(normalized - 90))
}

/**
 * Near-H/V als dominant + hoek &lt; NEAR_ORTHO_MAX_DEG; anders null (oblique/skip).
 */
export function classifyNearAxisWall(wall: Pick<Wall, 'a' | 'b'>): AxisKind | null {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const len = Math.hypot(dx, dy)
  if (len <= AXIS_EPS_CM) return null
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (offAxisDeg(angleDeg) >= NEAR_ORTHO_MAX_DEG) return null
  return Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V'
}

function axisValueOf(wall: Wall, axis: AxisKind): number {
  return axis === 'H' ? (wall.a.y + wall.b.y) / 2 : (wall.a.x + wall.b.x) / 2
}

function frozenAxisValue(point: Point2D, axis: AxisKind): number {
  return axis === 'H' ? point.y : point.x
}

function buildUnionFind(size: number): {
  find: (i: number) => number
  union: (a: number, b: number) => void
} {
  const parent = Array.from({ length: size }, (_, i) => i)
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i])
    return parent[i]
  }
  const union = (a: number, b: number): void => {
    parent[find(b)] = find(a)
  }
  return { find, union }
}

function uniqueFrozenValues(
  walls: Wall[],
  memberIndices: number[],
  axis: AxisKind,
  frozenKeys: Set<string>,
): number[] {
  const values: number[] = []
  for (const idx of memberIndices) {
    const wall = walls[idx]
    for (const point of [wall.a, wall.b]) {
      if (!frozenKeys.has(endpointKey(point))) continue
      const value = frozenAxisValue(point, axis)
      if (!values.some((existing) => Math.abs(existing - value) <= AXIS_EPS_CM)) {
        values.push(value)
      }
    }
  }
  return values
}

function lengthWeightedAxis(walls: Wall[], memberIndices: number[], axis: AxisKind): number | null {
  let weight = 0
  let sum = 0
  for (const idx of memberIndices) {
    const wall = walls[idx]
    const len = Math.max(AXIS_EPS_CM, wallLengthCm(wall))
    sum += axisValueOf(wall, axis) * len
    weight += len
  }
  return weight > 0 ? sum / weight : null
}

/**
 * Zet near-H/V muren exact op één as; knopen met oblique muren blijven vast.
 * Openingen houden wereldpositie via t-herprojectie.
 */
export function orthogonalizeNearAxisWalls(walls: Wall[]): Wall[] {
  if (walls.length === 0) return walls

  const work = walls.map(cloneWall)
  const kinds: Array<AxisKind | null> = work.map((wall) => classifyNearAxisWall(wall))

  const wallsAtPoint = new Map<string, number[]>()
  for (let index = 0; index < work.length; index += 1) {
    const wall = work[index]
    for (const point of [wall.a, wall.b]) {
      const key = endpointKey(point)
      const bucket = wallsAtPoint.get(key) ?? []
      bucket.push(index)
      wallsAtPoint.set(key, bucket)
    }
  }

  const frozenKeys = new Set<string>()
  for (const [key, indices] of wallsAtPoint) {
    if (indices.some((idx) => kinds[idx] == null)) frozenKeys.add(key)
  }

  const { find, union } = buildUnionFind(work.length)
  for (const indices of wallsAtPoint.values()) {
    const unique = [...new Set(indices)]
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const a = unique[i]
        const b = unique[j]
        const ka = kinds[a]
        const kb = kinds[b]
        if (ka != null && ka === kb) union(a, b)
      }
    }
  }

  const membersByRoot = new Map<number, number[]>()
  for (let i = 0; i < work.length; i += 1) {
    if (kinds[i] == null) continue
    const root = find(i)
    const list = membersByRoot.get(root) ?? []
    list.push(i)
    membersByRoot.set(root, list)
  }

  /** Per muur: as-doel, of null = deze muur niet snappen. */
  const wallTarget = new Map<number, number>()

  for (const members of membersByRoot.values()) {
    const axis = kinds[members[0]]
    if (axis == null) continue
    const frozenVals = uniqueFrozenValues(work, members, axis, frozenKeys)

    if (frozenVals.length >= 2) {
      // Conflicterende ankers: alleen muren met precies één bevroren eind én
      // een vrij eind dat niet met een andere H/V-muur uit deze component deelt.
      for (const idx of members) {
        const wall = work[idx]
        const keyA = endpointKey(wall.a)
        const keyB = endpointKey(wall.b)
        const aFrozen = frozenKeys.has(keyA)
        const bFrozen = frozenKeys.has(keyB)
        if (aFrozen === bFrozen) continue // beide of geen
        const frozenKey = aFrozen ? keyA : keyB
        const freeKey = aFrozen ? keyB : keyA
        const otherSameAxis = (wallsAtPoint.get(freeKey) ?? []).some(
          (other) => other !== idx && kinds[other] === axis && members.includes(other),
        )
        if (otherSameAxis) continue
        wallTarget.set(idx, frozenAxisValue(aFrozen ? wall.a : wall.b, axis))
        void frozenKey
      }
      continue
    }

    const target = frozenVals.length === 1 ? frozenVals[0] : lengthWeightedAxis(work, members, axis)
    if (target == null) continue
    for (const idx of members) {
      const wall = work[idx]
      const aFrozen = frozenKeys.has(endpointKey(wall.a))
      const bFrozen = frozenKeys.has(endpointKey(wall.b))
      if (aFrozen && bFrozen) continue
      wallTarget.set(idx, target)
    }
  }

  type NodePose = { x: number; y: number }
  const nodePose = new Map<string, NodePose>()

  for (const [key, indices] of wallsAtPoint) {
    const sample = work[indices[0]]
    const samplePoint =
      endpointKey(sample.a) === key ? sample.a : endpointKey(sample.b) === key ? sample.b : sample.a

    if (frozenKeys.has(key)) {
      nodePose.set(key, { x: samplePoint.x, y: samplePoint.y })
      continue
    }

    let nextX = samplePoint.x
    let nextY = samplePoint.y
    let fromH = false
    let fromV = false
    // Bij meerdere same-axis targets op één knoop: lengte-gewogen (zeldzaam na conflict-split).
    let hWeight = 0
    let hSum = 0
    let vWeight = 0
    let vSum = 0
    for (const idx of new Set(indices)) {
      const axis = kinds[idx]
      const target = wallTarget.get(idx)
      if (axis == null || target == null) continue
      const len = Math.max(AXIS_EPS_CM, wallLengthCm(work[idx]))
      if (axis === 'H') {
        hSum += target * len
        hWeight += len
        fromH = true
      } else {
        vSum += target * len
        vWeight += len
        fromV = true
      }
    }
    if (fromH) nextY = hSum / hWeight
    if (fromV) nextX = vSum / vWeight
    nodePose.set(key, { x: nextX, y: nextY })
  }

  for (let i = 0; i < work.length; i += 1) {
    const axis = kinds[i]
    const target = wallTarget.get(i)
    if (axis == null || target == null) continue

    const wall = work[i]
    const keyA = endpointKey(wall.a)
    const keyB = endpointKey(wall.b)
    if (frozenKeys.has(keyA) && frozenKeys.has(keyB)) continue

    const centers = wall.openings.map((opening) => openingWorldCenter(wall, opening.t))
    const poseA = nodePose.get(keyA)
    const poseB = nodePose.get(keyB)
    if (poseA) wall.a = { ...poseA }
    if (poseB) wall.b = { ...poseB }

    // Exacte as: bevroren eind dicteert; anders gedeeld target.
    if (axis === 'H') {
      const y = frozenKeys.has(keyA) ? wall.a.y : frozenKeys.has(keyB) ? wall.b.y : target
      if (!frozenKeys.has(keyA)) wall.a = { x: wall.a.x, y }
      if (!frozenKeys.has(keyB)) wall.b = { x: wall.b.x, y }
    } else {
      const x = frozenKeys.has(keyA) ? wall.a.x : frozenKeys.has(keyB) ? wall.b.x : target
      if (!frozenKeys.has(keyA)) wall.a = { x, y: wall.a.y }
      if (!frozenKeys.has(keyB)) wall.b = { x, y: wall.b.y }
    }

    wall.openings = reprojectOpenings(wall, centers)
  }

  return work
}
