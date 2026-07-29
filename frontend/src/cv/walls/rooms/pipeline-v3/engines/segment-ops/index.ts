/**
 * Segment CRUD — Copy(6) layer-5-segment-ops, policy-driven endpoint eps.
 */
import { buildJunctionGraph } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../../../room-wall-skeleton-types'
import type { WeldPolicy, JunctionGraphPolicy } from '../policy-types'

export type SegmentEndpoint = 'a' | 'b'

export interface IncidentSegment {
  segIndex: number
  endpoint: SegmentEndpoint
  other: { x: number; y: number }
  lengthPx: number
  angleDeg: number
  segment: Segment
}

const DEFAULT_ENDPOINT_EPS_PX = 1

function angleDegFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

export function cloneSegments(segments: Segment[]): Segment[] {
  return segments.map((seg) => ({
    ...seg,
    a: { ...seg.a },
    b: { ...seg.b },
  }))
}

export function pointsNear(
  a: { x: number; y: number },
  b: { x: number; y: number },
  epsPx: number = DEFAULT_ENDPOINT_EPS_PX,
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= epsPx
}

function pointsEqual(
  a: { x: number; y: number },
  b: { x: number; y: number },
  epsPx: number = DEFAULT_ENDPOINT_EPS_PX,
): boolean {
  return pointsNear(a, b, epsPx)
}

function incidentForSegment(
  seg: Segment,
  index: number,
  point: { x: number; y: number },
  epsPx: number,
): IncidentSegment | null {
  if (pointsNear(seg.a, point, epsPx)) {
    return {
      segIndex: index,
      endpoint: 'a',
      other: { ...seg.b },
      lengthPx: segmentLength(seg),
      angleDeg: angleDegFromPoints(seg.a, seg.b),
      segment: seg,
    }
  }
  if (pointsNear(seg.b, point, epsPx)) {
    return {
      segIndex: index,
      endpoint: 'b',
      other: { ...seg.a },
      lengthPx: segmentLength(seg),
      angleDeg: angleDegFromPoints(seg.b, seg.a),
      segment: seg,
    }
  }
  return null
}

export function incidentAt(
  segments: Segment[],
  point: { x: number; y: number },
  epsPx: number = DEFAULT_ENDPOINT_EPS_PX,
): IncidentSegment[] {
  const out: IncidentSegment[] = []
  for (let i = 0; i < segments.length; i += 1) {
    const hit = incidentForSegment(segments[i]!, i, point, epsPx)
    if (hit) out.push(hit)
  }
  return out
}

/**
 * Spatial hash van segment-eindpunten (cel = eps) voor snelle `incidentAtIndexed`.
 * Bouw één keer per stabiele scan; herbouw zodra segmenten muteren (weld/splice).
 */
export interface EndpointSpatialIndex {
  cellSize: number
  cells: Map<string, number[]>
}

function cellKey(x: number, y: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`
}

export function buildEndpointIndex(
  segments: Segment[],
  epsPx: number = DEFAULT_ENDPOINT_EPS_PX,
): EndpointSpatialIndex {
  const cellSize = epsPx > 0 ? epsPx : DEFAULT_ENDPOINT_EPS_PX
  const cells = new Map<string, number[]>()
  const add = (x: number, y: number, index: number): void => {
    const key = cellKey(x, y, cellSize)
    const bucket = cells.get(key)
    if (bucket) {
      if (bucket[bucket.length - 1] !== index) bucket.push(index)
    } else {
      cells.set(key, [index])
    }
  }
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!
    add(seg.a.x, seg.a.y, i)
    add(seg.b.x, seg.b.y, i)
  }
  return { cellSize, cells }
}

/**
 * Identiek resultaat als `incidentAt` (zelfde per-segment a/b-prioriteit en oplopende
 * segIndex-volgorde), maar zoekt via de 3×3 buurcellen i.p.v. een O(n) scan.
 */
export function incidentAtIndexed(
  segments: Segment[],
  index: EndpointSpatialIndex,
  point: { x: number; y: number },
  epsPx: number = DEFAULT_ENDPOINT_EPS_PX,
): IncidentSegment[] {
  const cx = Math.floor(point.x / index.cellSize)
  const cy = Math.floor(point.y / index.cellSize)
  const candidates = new Set<number>()
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = index.cells.get(`${cx + dx},${cy + dy}`)
      if (bucket) for (const i of bucket) candidates.add(i)
    }
  }
  if (candidates.size === 0) return []
  const sorted = [...candidates].sort((a, b) => a - b)
  const out: IncidentSegment[] = []
  for (const i of sorted) {
    const hit = incidentForSegment(segments[i]!, i, point, epsPx)
    if (hit) out.push(hit)
  }
  return out
}

export function replaceEndpoint(
  segments: Segment[],
  oldPoint: { x: number; y: number },
  newPoint: { x: number; y: number },
  epsPx: number = DEFAULT_ENDPOINT_EPS_PX,
): number {
  // Snapshot — callers often pass a live seg.a/seg.b; mutating that endpoint
  // mid-loop would retarget `oldPoint` to `newPoint` and skip other matches
  // (BouwTek11 @645,243: T-stub before long V → moved=1, stranded I).
  const from = { x: oldPoint.x, y: oldPoint.y }
  const to = { x: newPoint.x, y: newPoint.y }
  let replaced = 0
  for (const seg of segments) {
    if (pointsNear(seg.a, from, epsPx)) {
      seg.a.x = to.x
      seg.a.y = to.y
      replaced += 1
    }
    if (pointsNear(seg.b, from, epsPx)) {
      seg.b.x = to.x
      seg.b.y = to.y
      replaced += 1
    }
  }
  return replaced
}

/** Alleen één segment — voorkomt meebewegen van T-branch stubs op hetzelfde knooppunt. */
export function replaceSegmentEndpoint(
  segments: Segment[],
  segIndex: number,
  oldPoint: { x: number; y: number },
  newPoint: { x: number; y: number },
  epsPx: number = DEFAULT_ENDPOINT_EPS_PX,
): boolean {
  const seg = segments[segIndex]
  if (!seg) return false
  let changed = false
  if (pointsNear(seg.a, oldPoint, epsPx)) {
    seg.a.x = newPoint.x
    seg.a.y = newPoint.y
    changed = true
  }
  if (pointsNear(seg.b, oldPoint, epsPx)) {
    seg.b.x = newPoint.x
    seg.b.y = newPoint.y
    changed = true
  }
  return changed
}

export function removeSegmentAt(segments: Segment[], index: number): void {
  segments.splice(index, 1)
}

export function dropZeroLengthSegments(
  segments: Segment[],
  minLengthPx = 1,
): { segments: Segment[]; removed: number } {
  const kept: Segment[] = []
  let removed = 0
  for (const seg of segments) {
    // Inclusive: length === endpointEps (Copy6 default 1) must go — otherwise
    // mid-chain 1px stubs survive while incidentAt(eps=1) cannot see both ends.
    if (segmentLength(seg) <= minLengthPx) {
      removed += 1
      continue
    }
    kept.push({
      ...seg,
      a: { ...seg.a },
      b: { ...seg.b },
    })
  }
  return { segments: kept, removed }
}

export function dedupeExactSegments(
  segments: Segment[],
  epsPx = DEFAULT_ENDPOINT_EPS_PX,
): { segments: Segment[]; removed: number } {
  const kept: Segment[] = []
  let removed = 0
  for (const seg of segments) {
    const duplicate = kept.some((other) => {
      const sameTemplate = (seg.templateIndex ?? -1) === (other.templateIndex ?? -1)
      if (!sameTemplate) return false
      const forward = pointsEqual(seg.a, other.a, epsPx) && pointsEqual(seg.b, other.b, epsPx)
      const reverse = pointsEqual(seg.a, other.b, epsPx) && pointsEqual(seg.b, other.a, epsPx)
      return forward || reverse
    })
    if (duplicate) {
      removed += 1
      continue
    }
    kept.push({
      ...seg,
      a: { ...seg.a },
      b: { ...seg.b },
    })
  }
  return { segments: kept, removed }
}

function buildJunctionsFromGraph(
  graph: ReturnType<typeof buildJunctionGraph>,
  rootLabel: number,
): RoomWallJunction[] {
  return graph.nodes.map((node) => ({
    rootLabel,
    x: node.x,
    y: node.y,
    kind: node.kind,
    angleDeg: node.angleDeg,
  }))
}

type EndpointGroupMember = {
  segIndex: number
  endpoint: SegmentEndpoint
  point: { x: number; y: number }
}

function endpointsByteIdentical(group: EndpointGroupMember[]): boolean {
  const first = group[0]!
  return group.every(
    (item) => item.point.x === first.point.x && item.point.y === first.point.y,
  )
}

function groupMaxPairwiseDistance(group: EndpointGroupMember[]): number {
  let maxD = 0
  for (let a = 0; a < group.length; a += 1) {
    for (let b = a + 1; b < group.length; b += 1) {
      const d = Math.hypot(
        group[a]!.point.x - group[b]!.point.x,
        group[a]!.point.y - group[b]!.point.y,
      )
      if (d > maxD) maxD = d
    }
  }
  return maxD
}

/**
 * Snap near-coincident endpoints to one byte-identical coordinate.
 * Unlike the old micro-weld skip (`maxD <= 1e-6`), ULP drift is forced equal so
 * snap=0 junction graphs do not explode a through-joint into two I's
 * (2D_3E @726.64,516 after same-line rewrite).
 */
export function unifyNearEndpoints(
  segments: Segment[],
  maxGapPx: number,
  indexEpsPx: number = maxGapPx,
): { segments: Segment[]; unifiedCount: number } {
  const work = cloneSegments(segments)
  let unifiedCount = 0
  let changed = true
  while (changed) {
    changed = false
    const index = buildEndpointIndex(work, indexEpsPx)
    outer: for (let i = 0; i < work.length; i += 1) {
      for (const endpoint of ['a', 'b'] as const) {
        const point = endpoint === 'a' ? work[i]!.a : work[i]!.b
        const incidents = incidentAtIndexed(work, index, point, indexEpsPx)
        if (incidents.length < 2) continue

        const unique = new Map<string, EndpointGroupMember>()
        for (const hit of incidents) {
          const key = `${hit.segIndex}:${hit.endpoint}`
          if (unique.has(key)) continue
          const ep = hit.endpoint === 'a' ? work[hit.segIndex]!.a : work[hit.segIndex]!.b
          unique.set(key, {
            segIndex: hit.segIndex,
            endpoint: hit.endpoint,
            point: { x: ep.x, y: ep.y },
          })
        }
        const group = [...unique.values()]
        if (group.length < 2) continue

        const maxD = groupMaxPairwiseDistance(group)
        if (maxD > maxGapPx) continue
        if (endpointsByteIdentical(group)) continue

        const target = {
          x: group.reduce((sum, item) => sum + item.point.x, 0) / group.length,
          y: group.reduce((sum, item) => sum + item.point.y, 0) / group.length,
        }
        for (const item of group) {
          const seg = work[item.segIndex]!
          if (item.endpoint === 'a') {
            seg.a.x = target.x
            seg.a.y = target.y
          } else {
            seg.b.x = target.x
            seg.b.y = target.y
          }
        }
        unifiedCount += 1
        changed = true
        break outer
      }
    }
  }
  return { segments: work, unifiedCount }
}

/**
 * Non-weld face rebuild: junction graph only (no unifyNearEndpoints).
 * L2/L3 home — L5+ must keep {@link rebuildFaceFromSegments} with weld bake.
 */
export function rebuildFaceJunctionsOnly(
  face: RoomWallFaceSkeleton,
  segments: Segment[],
  junctionSnapPx: number,
): RoomWallFaceSkeleton {
  const graph = buildJunctionGraph(segments, junctionSnapPx)
  const junctions = buildJunctionsFromGraph(graph, face.rootLabel)
  return {
    ...face,
    segments,
    junctions,
    stats: {
      segmentCount: segments.length,
      junctionCount: junctions.length,
      elapsedMs: face.stats.elapsedMs,
    },
  }
}

/**
 * Rebuild face junctions; bake near-endpoint unification into returned segments
 * so later layers (snap=0 graphs / L6 connectors) see byte-identical hubs.
 */
export function rebuildFaceFromSegments(
  face: RoomWallFaceSkeleton,
  segments: Segment[],
  weldPolicy?: WeldPolicy,
  junctionPolicy?: JunctionGraphPolicy,
): RoomWallFaceSkeleton {
  const snapPx = junctionPolicy?.snapPx ?? 0
  const baked =
    junctionPolicy?.weldBeforeGraph !== false && weldPolicy
      ? unifyNearEndpoints(segments, weldPolicy.endpointEpsPx).segments
      : segments
  const graph = buildJunctionGraph(baked, snapPx)
  const junctions = buildJunctionsFromGraph(graph, face.rootLabel)
  return {
    ...face,
    segments: baked,
    junctions,
    stats: {
      ...face.stats,
      segmentCount: baked.length,
      junctionCount: junctions.length,
    },
  }
}

/** Default grid matches L6 converge (0.1px). L5 accept uses 0.01 + template. */
const SEGMENT_SET_DEFAULT_GRID_PX = 0.1

export type SegmentSetIdentityOptions = {
  gridPx?: number
  includeTemplateIndex?: boolean
}

function segmentIdentityKey(seg: Segment, options?: SegmentSetIdentityOptions): string {
  const gridPx = options?.gridPx ?? SEGMENT_SET_DEFAULT_GRID_PX
  const q = (v: number): number => Math.round(v / gridPx)
  const forward = `${q(seg.a.x)},${q(seg.a.y)}:${q(seg.b.x)},${q(seg.b.y)}`
  const backward = `${q(seg.b.x)},${q(seg.b.y)}:${q(seg.a.x)},${q(seg.a.y)}`
  const edge = forward < backward ? forward : backward
  if (!options?.includeTemplateIndex) return edge
  return `${edge}|t:${seg.templateIndex ?? -1}`
}

/**
 * Order- and jitter-independent segment-set identity (L5 accept / L6 converge).
 * Keys are undirected; signature is a sorted multiset join.
 */
export function segmentSetSignature(
  segments: Segment[],
  options?: SegmentSetIdentityOptions,
): string {
  const keys = segments.map((seg) => segmentIdentityKey(seg, options))
  keys.sort()
  return keys.join('|')
}

/** True when quantized segment multisets differ (length or identity). */
export function segmentSetChanged(
  before: Segment[],
  after: Segment[],
  options?: SegmentSetIdentityOptions,
): boolean {
  return segmentSetSignature(before, options) !== segmentSetSignature(after, options)
}
