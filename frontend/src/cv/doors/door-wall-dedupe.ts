import { tally } from '@/core/diagnostics'
import type { BoundDoor, DoorOpeningAxis } from './types'

/** Fractie van de kleinere span: intersection / min(len) ≥ dit → conflict. */
const DOOR_DEDUPE_OVERLAP_MIN_RATIO = 0.5

/** 1D-IoU ≥ dit → pure dubbel / near-dubbel. */
const DOOR_DEDUPE_IOU = 0.6

type AxisInterval = { a0: number; a1: number; len: number }

function wallAxisInterval(params: {
  openingAxis: DoorOpeningAxis
  openingStartPx: { x: number; y: number }
  openingEndPx: { x: number; y: number }
  widthPx?: number
}): AxisInterval {
  const a0 =
    params.openingAxis === 'h'
      ? Math.min(params.openingStartPx.x, params.openingEndPx.x)
      : Math.min(params.openingStartPx.y, params.openingEndPx.y)
  const a1 =
    params.openingAxis === 'h'
      ? Math.max(params.openingStartPx.x, params.openingEndPx.x)
      : Math.max(params.openingStartPx.y, params.openingEndPx.y)
  const raw = a1 - a0
  const len = raw > 1e-6 ? raw : Math.max(params.widthPx ?? 0, 1e-6)
  return { a0, a1: a0 + len, len }
}

function intervalIntersection(a: AxisInterval, b: AxisInterval): number {
  return Math.max(0, Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0))
}

function intervalIou(a: AxisInterval, b: AxisInterval): number {
  const inter = intervalIntersection(a, b)
  const union = a.len + b.len - inter
  if (union <= 1e-6) return inter > 0 ? 1 : 0
  return inter / union
}

function intervalOverlapMinRatio(a: AxisInterval, b: AxisInterval): number {
  const inter = intervalIntersection(a, b)
  const minLen = Math.min(a.len, b.len)
  if (minLen <= 1e-6) return inter > 0 ? 1 : 0
  return inter / minLen
}

function intervalsConflict(a: AxisInterval, b: AxisInterval): boolean {
  return (
    intervalOverlapMinRatio(a, b) >= DOOR_DEDUPE_OVERLAP_MIN_RATIO ||
    intervalIou(a, b) >= DOOR_DEDUPE_IOU
  )
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Span op muur-as: Path A clear, anders snapped bbox langs openingAxis. */
export function boundDoorOpeningSpan(door: BoundDoor): {
  openingStartPx: { x: number; y: number }
  openingEndPx: { x: number; y: number }
  widthPx: number
} {
  if (door.doorframeClearOpening) {
    const start = door.doorframeClearOpening.startPx
    const end = door.doorframeClearOpening.endPx
    const widthPx = door.openingAxis === 'h' ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)
    return {
      openingStartPx: start,
      openingEndPx: end,
      widthPx: Math.max(1, widthPx),
    }
  }
  const { x, y, width, height } = door.snappedBBox
  if (door.openingAxis === 'h') {
    const midY = y + height / 2
    return {
      openingStartPx: { x, y: midY },
      openingEndPx: { x: x + width, y: midY },
      widthPx: Math.max(1, width),
    }
  }
  const midX = x + width / 2
  return {
    openingStartPx: { x: midX, y },
    openingEndPx: { x: midX, y: y + height },
    widthPx: Math.max(1, height),
  }
}

function shortAxisPx(door: BoundDoor): number {
  return Math.max(1, Math.min(door.snappedBBox.width, door.snappedBBox.height))
}

function doorInterval(door: BoundDoor): AxisInterval {
  const span = boundDoorOpeningSpan(door)
  return wallAxisInterval({
    openingAxis: door.openingAxis,
    openingStartPx: span.openingStartPx,
    openingEndPx: span.openingEndPx,
    widthPx: span.widthPx,
  })
}

/**
 * Dunnere hit = kozijn-achtig (clear op muur); dikkere = swing (L12 hinge).
 * Clear/opening volgt van de frame-span — niet van de hele swing-bbox.
 */
// ESC:D-63 (A)
export function mergeBoundDoorFrameSwingCluster(doors: BoundDoor[]): BoundDoor {
  if (doors.length === 1) return doors[0]
  const ranked = [...doors].sort((a, b) => {
    const shortDiff = shortAxisPx(a) - shortAxisPx(b)
    if (shortDiff !== 0) return shortDiff
    if (a.contactScore !== b.contactScore) return b.contactScore - a.contactScore
    return a.doorId.localeCompare(b.doorId)
  })
  const frame = ranked[0]
  const swing =
    ranked.slice(1).sort((a, b) => {
      if (a.contactScore !== b.contactScore) return b.contactScore - a.contactScore
      return shortAxisPx(b) - shortAxisPx(a)
    })[0] ?? frame

  const frameSpan = boundDoorOpeningSpan(frame)
  const thick = shortAxisPx(frame)
  const along = frameSpan.widthPx
  const mid0 = (frameSpan.openingStartPx.x + frameSpan.openingEndPx.x) / 2
  const mid1 = (frameSpan.openingStartPx.y + frameSpan.openingEndPx.y) / 2

  const snappedBBox =
    frame.openingAxis === 'h'
      ? {
          x: round2(mid0 - along / 2),
          y: round2(mid1 - thick / 2),
          width: round2(along),
          height: round2(thick),
        }
      : {
          x: round2(mid0 - thick / 2),
          y: round2(mid1 - along / 2),
          width: round2(thick),
          height: round2(along),
        }

  tally('D-63', 'merged_frame_swing')
  return {
    ...swing,
    t: frame.t,
    junctionAId: frame.junctionAId ?? swing.junctionAId,
    junctionBId: frame.junctionBId ?? swing.junctionBId,
    contactScore: Math.max(frame.contactScore, swing.contactScore),
    secondaryContactScore: Math.max(frame.secondaryContactScore, swing.secondaryContactScore),
    doorframeClearOpening: {
      startPx: { ...frameSpan.openingStartPx },
      endPx: { ...frameSpan.openingEndPx },
    },
    snappedBBox,
  }
}

/**
 * L11: 1D muurgat-merge per segmentIndex (R-28-spiegel).
 * Overlap → één deur: dunnere hit als clear (virtueel doorframe), dikkere als swing-id.
 */
// ESC:D-63 (A)
// ESC:D-63 (A)
export function dedupeOverlappingBoundDoors(doors: BoundDoor[]): BoundDoor[] {
  if (doors.length <= 1) return doors

  const bySegment = new Map<number, BoundDoor[]>()
  for (const door of doors) {
    const list = bySegment.get(door.segmentIndex)
    if (list) list.push(door)
    else bySegment.set(door.segmentIndex, [door])
  }

  const out: BoundDoor[] = []
  for (const segmentIndex of [...bySegment.keys()].sort((a, b) => a - b)) {
    const group = bySegment.get(segmentIndex) ?? []
    if (group.length <= 1) {
      out.push(...group)
      continue
    }

    const intervals = group.map((door) => ({ door, interval: doorInterval(door) }))
    const parent = intervals.map((_, i) => i)
    const find = (i: number): number => {
      let root = i
      while (parent[root] !== root) root = parent[root]!
      let cur = i
      while (parent[cur] !== cur) {
        const next = parent[cur]
        parent[cur] = root
        cur = next
      }
      return root
    }
    const unite = (a: number, b: number) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[rb] = ra
    }

    for (let i = 0; i < intervals.length; i += 1) {
      for (let j = i + 1; j < intervals.length; j += 1) {
        if (intervalsConflict(intervals[i].interval, intervals[j].interval)) {
          unite(i, j)
        }
      }
    }

    const clusters = new Map<number, BoundDoor[]>()
    for (let i = 0; i < intervals.length; i += 1) {
      const root = find(i)
      const list = clusters.get(root) ?? []
      list.push(intervals[i].door)
      clusters.set(root, list)
    }

    for (const cluster of clusters.values()) {
      if (cluster.length === 1) {
        out.push(cluster[0])
        continue
      }
      tally('D-63', 'dropped_overlap')
      out.push(mergeBoundDoorFrameSwingCluster(cluster))
    }
  }

  return out
}
