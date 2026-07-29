import { unionFaceBBox } from '@/cv/walls/rooms/face-dual-space'
import { CONCEPT_WINDOW_REFID, WINDOW_DOUBLE_REFID, WINDOW_TRIPLE_REFID } from '@/core/fml/types'
import type { BoundWindow } from './types'

type BBox = { x: number; y: number; width: number; height: number }

/** Max relatieve afwijking in maatvoering (breedte én loodrechte span). */
const WINDOW_MERGE_MAX_SIZE_RATIO = 0.05

/** Touch-eps als fractie van window-ref (loodrechte opening-span); ≈1.5 bij span≈30. */
const WINDOW_MERGE_BBOX_TOUCH_EPS_RATIO = 0.05

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function perpSpanPx(window: BoundWindow): number {
  return window.openingAxis === 'h' ? window.openingBBox.height : window.openingBBox.width
}

function resolveMergeTouchEpsPx(a: BoundWindow, b: BoundWindow): number {
  const refPx = Math.min(perpSpanPx(a), perpSpanPx(b))
  return Math.max(0, refPx * WINDOW_MERGE_BBOX_TOUCH_EPS_RATIO)
}

function bboxesTouchOrOverlap(a: BBox, b: BBox, eps: number): boolean {
  return !(
    a.x + a.width + eps < b.x ||
    b.x + b.width + eps < a.x ||
    a.y + a.height + eps < b.y ||
    b.y + b.height + eps < a.y
  )
}

function relativeDiff(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b))
  if (max <= 1e-6) return 0
  return Math.abs(a - b) / max
}

function sizesCompatible(
  a: BoundWindow,
  b: BoundWindow,
  maxRatio = WINDOW_MERGE_MAX_SIZE_RATIO,
): boolean {
  return (
    relativeDiff(a.widthPx, b.widthPx) <= maxRatio &&
    relativeDiff(perpSpanPx(a), perpSpanPx(b)) <= maxRatio
  )
}

function canMergePair(a: BoundWindow, b: BoundWindow): boolean {
  if (a.segmentIndex !== b.segmentIndex) return false
  if (a.fmlRefId !== CONCEPT_WINDOW_REFID || b.fmlRefId !== CONCEPT_WINDOW_REFID) return false
  if (!bboxesTouchOrOverlap(a.openingBBox, b.openingBBox, resolveMergeTouchEpsPx(a, b)))
    return false
  return sizesCompatible(a, b)
}

/** Alle opeenvolgende paren in de keten moeten mergebaar zijn. */
function canMergeChain(windows: BoundWindow[]): boolean {
  if (windows.length < 2) return false
  for (let i = 0; i + 1 < windows.length; i += 1) {
    if (!canMergePair(windows[i], windows[i + 1])) return false
  }
  return true
}

function mergeGroup(windows: BoundWindow[]): BoundWindow {
  const first = windows[0]
  const last = windows[windows.length - 1]
  let bbox = { ...first.openingBBox }
  const faceIds = new Set<number>()
  let widthCmSum = 0
  for (const window of windows) {
    bbox = unionFaceBBox(bbox, window.openingBBox)
    widthCmSum += window.widthCm
    for (const faceId of window.faceIds) {
      if (faceId > 0) faceIds.add(faceId)
    }
  }

  // Span = extreme opening-einden langs de as — niet first.start/last.end op t-volgorde,
  // want bij segment a→b rechts→links levert die laatste aanpak een ~overlap-span (~0) op.
  const allEnds = windows.flatMap((window) => [window.openingStartPx, window.openingEndPx])
  const sortedEnds =
    first.openingAxis === 'h'
      ? [...allEnds].sort((a, b) => a.x - b.x || a.y - b.y)
      : [...allEnds].sort((a, b) => a.y - b.y || a.x - b.x)
  const openingStartPx = sortedEnds[0]
  const openingEndPx = sortedEnds[sortedEnds.length - 1]
  const spanPx = Math.hypot(openingEndPx.x - openingStartPx.x, openingEndPx.y - openingStartPx.y)

  const panelCount = windows.length as 2 | 3
  const fmlRefId = panelCount === 3 ? WINDOW_TRIPLE_REFID : WINDOW_DOUBLE_REFID

  return {
    windowId: windows.map((window) => window.windowId).join('__'),
    segmentIndex: first.segmentIndex,
    t: round2((first.t + last.t) / 2),
    openingAxis: first.openingAxis,
    openingBBox: bbox,
    openingStartPx: { x: round2(openingStartPx.x), y: round2(openingStartPx.y) },
    openingEndPx: { x: round2(openingEndPx.x), y: round2(openingEndPx.y) },
    widthPx: round2(spanPx),
    widthCm: round2(widthCmSum),
    fmlRefId,
    evidence: windows.some((window) => window.evidence === 'framing') ? 'framing' : first.evidence,
    faceIds: [...faceIds].sort((a, b) => a - b),
  }
}

/**
 * Per segment, van voor naar achter (stijgende `t`): greedy 3 → 2 → 1.
 * Zes gelijke aanliggende ramen → twee triples.
 * Alleen singles (`CONCEPT_WINDOW_REFID`) met rake/overlappende bbox + ≤5% maatverschil.
 */
export function mergeAdjacentBoundWindows(windows: BoundWindow[]): BoundWindow[] {
  if (windows.length <= 1) return windows

  const bySegment = new Map<number, BoundWindow[]>()
  for (const window of windows) {
    const list = bySegment.get(window.segmentIndex)
    if (list) list.push(window)
    else bySegment.set(window.segmentIndex, [window])
  }

  const out: BoundWindow[] = []
  const segmentIndices = [...bySegment.keys()].sort((a, b) => a - b)
  for (const segmentIndex of segmentIndices) {
    const sorted = [...(bySegment.get(segmentIndex) ?? [])].sort((a, b) => {
      if (a.t !== b.t) return a.t - b.t
      return a.windowId.localeCompare(b.windowId)
    })
    let i = 0
    while (i < sorted.length) {
      const triple = sorted.slice(i, i + 3)
      if (triple.length === 3 && canMergeChain(triple)) {
        out.push(mergeGroup(triple))
        i += 3
        continue
      }
      const pair = sorted.slice(i, i + 2)
      if (pair.length === 2 && canMergeChain(pair)) {
        out.push(mergeGroup(pair))
        i += 2
        continue
      }
      out.push(sorted[i])
      i += 1
    }
  }
  return out
}
