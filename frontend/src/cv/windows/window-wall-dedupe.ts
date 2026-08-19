import { tally } from '@/core/diagnostics'
import type { BoundWindow, WindowOpeningAxis } from './types'

/** Fractie van de kleinere span: intersection / min(len) ≥ dit → conflict. */
const WINDOW_DEDUPE_OVERLAP_MIN_RATIO = 0.5

/** 1D-IoU ≥ dit → pure dubbel / near-dubbel. */
const WINDOW_DEDUPE_IOU = 0.6

/** Deur wint alleen bij bijna-coïncidente spans (strak; kozijn-delen behouden). */
const DOOR_WINS_WINDOW_IOU = 0.75

/** Midpoint-afstand ≤ dit × min(lenDoor, lenWindow) → deur wint. */
const DOOR_WINS_WINDOW_MID_RATIO = 0.1

export type WallOpeningSpan = {
  segmentIndex: number
  openingAxis: WindowOpeningAxis
  openingStartPx: { x: number; y: number }
  openingEndPx: { x: number; y: number }
  /** Optioneel; degeneraat start/end → len-fallback. */
  widthPx?: number
}

type AxisInterval = { a0: number; a1: number; len: number }

function wallAxisInterval(span: WallOpeningSpan): AxisInterval {
  const a0 =
    span.openingAxis === 'h'
      ? Math.min(span.openingStartPx.x, span.openingEndPx.x)
      : Math.min(span.openingStartPx.y, span.openingEndPx.y)
  const a1 =
    span.openingAxis === 'h'
      ? Math.max(span.openingStartPx.x, span.openingEndPx.x)
      : Math.max(span.openingStartPx.y, span.openingEndPx.y)
  const raw = a1 - a0
  const len = raw > 1e-6 ? raw : Math.max(span.widthPx ?? 0, 1e-6)
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
    intervalOverlapMinRatio(a, b) >= WINDOW_DEDUPE_OVERLAP_MIN_RATIO ||
    intervalIou(a, b) >= WINDOW_DEDUPE_IOU
  )
}

function midpoint(interval: AxisInterval): number {
  return (interval.a0 + interval.a1) / 2
}

/**
 * L14: 1D muurgat-NMS per segmentIndex, vóór double/triple-merge.
 * Greedy smaller-first: bij zware overlap / IoU houdt de kleinere (meer ramen winnen van giants).
 */
// ESC:R-28 (A)
export function dedupeOverlappingBoundWindows(windows: BoundWindow[]): BoundWindow[] {
  if (windows.length <= 1) return windows

  const bySegment = new Map<number, BoundWindow[]>()
  for (const window of windows) {
    const list = bySegment.get(window.segmentIndex)
    if (list) list.push(window)
    else bySegment.set(window.segmentIndex, [window])
  }

  const keptIds = new Set<string>()
  for (const segmentIndex of [...bySegment.keys()].sort((a, b) => a - b)) {
    const group = bySegment.get(segmentIndex) ?? []
    const ranked = [...group].sort((a, b) => {
      if (a.widthPx !== b.widthPx) return a.widthPx - b.widthPx
      return a.windowId.localeCompare(b.windowId)
    })
    const claimed: AxisInterval[] = []
    for (const window of ranked) {
      const interval = wallAxisInterval(window)
      const hits = claimed.some((other) => intervalsConflict(interval, other))
      if (hits) {
        const isNearDuplicate = claimed.some(
          (other) => intervalIou(interval, other) >= WINDOW_DEDUPE_IOU,
        )
        tally('R-28', isNearDuplicate ? 'dropped_duplicate' : 'dropped_overlap')
        continue
      }
      claimed.push(interval)
      keptIds.add(window.windowId)
    }
  }

  return windows.filter((window) => keptIds.has(window.windowId))
}

function doorWinsOverWindow(door: AxisInterval, window: AxisInterval): boolean {
  if (intervalIou(door, window) >= DOOR_WINS_WINDOW_IOU) return true
  const midGap = Math.abs(midpoint(door) - midpoint(window))
  return midGap <= DOOR_WINS_WINDOW_MID_RATIO * Math.min(door.len, window.len)
}

/**
 * Strakke deur→raam suppress op gedeeld segment + as.
 * Alleen bijna-coïncidente muurgaten; raam naast deur / gedeeld kozijn blijft.
 */
// ESC:X-28 (A)
export function suppressWindowsNearDoors(
  windows: BoundWindow[],
  doors: readonly WallOpeningSpan[],
): BoundWindow[] {
  if (windows.length <= 0 || doors.length <= 0) return windows

  const doorsBySegment = new Map<number, WallOpeningSpan[]>()
  for (const door of doors) {
    const list = doorsBySegment.get(door.segmentIndex)
    if (list) list.push(door)
    else doorsBySegment.set(door.segmentIndex, [door])
  }

  return windows.filter((window) => {
    const segmentDoors = doorsBySegment.get(window.segmentIndex)
    if (!segmentDoors || segmentDoors.length <= 0) return true
    const windowIv = wallAxisInterval(window)
    for (const door of segmentDoors) {
      if (door.openingAxis !== window.openingAxis) continue
      if (doorWinsOverWindow(wallAxisInterval(door), windowIv)) {
        tally('X-28', 'door_wins_window')
        return false
      }
    }
    return true
  })
}
