import type {
  CompareLayerTransitionOptions,
  DroppedSegmentDiff,
  FlatLayer,
  JunctionRef,
  JunctionTransitionItem,
  LayerId,
  LayerTransitionDiff,
  LayerTransitionId,
  SegmentTransitionItem,
} from './types.ts'
import {
  endpointErrorPx,
  orientationSimilar,
  segmentProjectsOntoLine,
  toSegmentRef,
} from './segment-geometry.ts'

const DEFAULTS: Required<CompareLayerTransitionOptions> = {
  tolerancePx: 8,
  movedThresholdPx: 3,
  junctionSnapPx: 8,
  junctionShiftThresholdPx: 3,
  mergeBandPx: 6,
  spurMinLengthPx: 50,
}

function isSpurPrunePair(from: LayerTransitionId, to: LayerTransitionId): boolean {
  return (from === 'B' && to === 'C') || (from === 'layer2' && to === 'layer3')
}

function isCollinearMergePair(from: LayerTransitionId, to: LayerTransitionId): boolean {
  return (from === 'A' && to === 'B') || (from === 'layer1' && to === 'layer2')
}

function inferDropReason(
  seg: ReturnType<typeof toSegmentRef>,
  from: LayerTransitionId,
  to: LayerTransitionId,
  spurMinLengthPx: number,
): DroppedSegmentDiff['dropReasonHint'] {
  if (isSpurPrunePair(from, to) && seg.lengthPx < spurMinLengthPx) {
    return 'likely_spur_prune'
  }
  if (isSpurPrunePair(from, to) && seg.lengthPx < spurMinLengthPx * 1.5) {
    return 'likely_length_filter'
  }
  if (isCollinearMergePair(from, to)) {
    return 'likely_collinear_merge'
  }
  return 'unmatched'
}

function toJunctionRef(index: number, junction: FlatLayer['junctions'][number]): JunctionRef {
  return {
    index,
    x: junction.x,
    y: junction.y,
    kind: junction.kind,
    angleDeg: junction.angleDeg,
  }
}

function compareJunctions(
  prev: FlatLayer,
  next: FlatLayer,
  opts: Required<CompareLayerTransitionOptions>,
): JunctionTransitionItem[] {
  const items: JunctionTransitionItem[] = []
  const prevRefs = prev.junctions.map((junction, index) => toJunctionRef(index, junction))
  const nextRefs = next.junctions.map((junction, index) => toJunctionRef(index, junction))
  const usedPrev = new Set<number>()
  const usedNext = new Set<number>()

  for (let ni = 0; ni < nextRefs.length; ni++) {
    const nextJ = nextRefs[ni]!
    let bestPi = -1
    let bestDist = Infinity
    for (let pi = 0; pi < prevRefs.length; pi++) {
      if (usedPrev.has(pi)) continue
      const prevJ = prevRefs[pi]!
      const d = Math.hypot(prevJ.x - nextJ.x, prevJ.y - nextJ.y)
      if (d < bestDist) {
        bestDist = d
        bestPi = pi
      }
    }
    if (bestPi < 0 || bestDist > opts.junctionSnapPx) continue
    usedPrev.add(bestPi)
    usedNext.add(ni)
    const prevJ = prevRefs[bestPi]!
    const kindChanged = prevJ.kind !== nextJ.kind
    if (bestDist <= opts.junctionShiftThresholdPx && !kindChanged) {
      items.push({
        kind: 'kept',
        prevIndex: bestPi,
        nextIndex: ni,
        shiftPx: Math.round(bestDist * 10) / 10,
        kindChanged: false,
        prev: prevJ,
        next: nextJ,
      })
    } else {
      items.push({
        kind: 'shifted',
        prevIndex: bestPi,
        nextIndex: ni,
        shiftPx: Math.round(bestDist * 10) / 10,
        kindChanged,
        prev: prevJ,
        next: nextJ,
      })
    }
  }

  for (let pi = 0; pi < prevRefs.length; pi++) {
    if (usedPrev.has(pi)) continue
    items.push({ kind: 'dropped', prevIndex: pi, prev: prevRefs[pi]! })
  }
  for (let ni = 0; ni < nextRefs.length; ni++) {
    if (usedNext.has(ni)) continue
    items.push({ kind: 'added', nextIndex: ni, next: nextRefs[ni]! })
  }

  return items
}

export function compareLayerTransition(
  from: LayerTransitionId,
  to: LayerTransitionId,
  prev: FlatLayer,
  next: FlatLayer,
  options: CompareLayerTransitionOptions = {},
): LayerTransitionDiff {
  const opts = { ...DEFAULTS, ...options }
  const prevRefs = prev.segments.map((seg, index) => toSegmentRef(index, seg))
  const nextRefs = next.segments.map((seg, index) => toSegmentRef(index, seg))

  const kept: SegmentTransitionItem[] = []
  const moved: SegmentTransitionItem[] = []
  const merged: SegmentTransitionItem[] = []
  const dropped: SegmentTransitionItem[] = []
  const added: SegmentTransitionItem[] = []

  const matchedPrev = new Set<number>()
  const matchedNext = new Set<number>()

  // Fase 1: 1:1 matches (kept / moved)
  for (let ni = 0; ni < nextRefs.length; ni++) {
    const nextSeg = nextRefs[ni]!
    let bestPi = -1
    let bestError = Infinity
    for (let pi = 0; pi < prevRefs.length; pi++) {
      if (matchedPrev.has(pi)) continue
      const prevSeg = prevRefs[pi]!
      if (!orientationSimilar(prevSeg, nextSeg)) continue
      const err = endpointErrorPx(prevSeg, nextSeg)
      if (err < bestError) {
        bestError = err
        bestPi = pi
      }
    }
    if (bestPi < 0 || bestError > opts.tolerancePx) continue
    matchedPrev.add(bestPi)
    matchedNext.add(ni)
    const prevSeg = prevRefs[bestPi]!
    if (bestError <= opts.movedThresholdPx) {
      kept.push({
        kind: 'kept',
        prevIndex: bestPi,
        nextIndex: ni,
        endpointErrorPx: Math.round(bestError * 10) / 10,
        prev: prevSeg,
        next: nextSeg,
      })
    } else {
      moved.push({
        kind: 'moved',
        prevIndex: bestPi,
        nextIndex: ni,
        endpointErrorPx: Math.round(bestError * 10) / 10,
        prev: prevSeg,
        next: nextSeg,
        dropReasonHint: 'inferred_moved',
      })
    }
  }

  // Fase 2: merged (meerdere prev → één next)
  for (let ni = 0; ni < nextRefs.length; ni++) {
    if (matchedNext.has(ni)) continue
    const nextSeg = nextRefs[ni]!
    const mergePrev: number[] = []
    for (let pi = 0; pi < prevRefs.length; pi++) {
      if (matchedPrev.has(pi)) continue
      if (segmentProjectsOntoLine(prevRefs[pi]!, nextSeg, opts.mergeBandPx)) {
        mergePrev.push(pi)
      }
    }
    if (mergePrev.length === 0) continue
    for (const pi of mergePrev) matchedPrev.add(pi)
    matchedNext.add(ni)
    const prevSegs = mergePrev.map((pi) => prevRefs[pi]!)
    merged.push({
      kind: 'merged',
      prevIndices: mergePrev,
      nextIndex: ni,
      prev: prevSegs,
      next: nextSeg,
      dropReasonHint: isCollinearMergePair(from, to)
        ? 'likely_collinear_merge'
        : 'likely_parallel_merge',
    })
  }

  // Fase 3: fuzzy match op middenpunt (restanten)
  for (let ni = 0; ni < nextRefs.length; ni++) {
    if (matchedNext.has(ni)) continue
    const nextSeg = nextRefs[ni]!
    let bestPi = -1
    let bestMidDist = Infinity
    for (let pi = 0; pi < prevRefs.length; pi++) {
      if (matchedPrev.has(pi)) continue
      const prevSeg = prevRefs[pi]!
      if (!orientationSimilar(prevSeg, nextSeg, 0.85)) continue
      const midDist = Math.hypot(prevSeg.mid.x - nextSeg.mid.x, prevSeg.mid.y - nextSeg.mid.y)
      if (midDist < bestMidDist) {
        bestMidDist = midDist
        bestPi = pi
      }
    }
    if (bestPi < 0 || bestMidDist > opts.tolerancePx * 2) continue
    matchedPrev.add(bestPi)
    matchedNext.add(ni)
    moved.push({
      kind: 'moved',
      prevIndex: bestPi,
      nextIndex: ni,
      endpointErrorPx: Math.round(endpointErrorPx(prevRefs[bestPi]!, nextSeg) * 10) / 10,
      prev: prevRefs[bestPi]!,
      next: nextSeg,
      dropReasonHint: 'inferred_moved',
    })
  }

  for (let pi = 0; pi < prevRefs.length; pi++) {
    if (matchedPrev.has(pi)) continue
    dropped.push({
      kind: 'dropped',
      prevIndex: pi,
      prev: prevRefs[pi]!,
      dropReasonHint: inferDropReason(prevRefs[pi]!, from, to, opts.spurMinLengthPx),
    })
  }

  for (let ni = 0; ni < nextRefs.length; ni++) {
    if (matchedNext.has(ni)) continue
    added.push({
      kind: 'added',
      nextIndex: ni,
      next: nextRefs[ni]!,
    })
  }

  const junctionItems = compareJunctions(prev, next, opts)
  const junctionKept = junctionItems.filter((item) => item.kind === 'kept')
  const junctionShifted = junctionItems.filter((item) => item.kind === 'shifted')
  const junctionDropped = junctionItems.filter((item) => item.kind === 'dropped')
  const junctionAdded = junctionItems.filter((item) => item.kind === 'added')

  return {
    from,
    to,
    tolerancePx: opts.tolerancePx,
    summary: {
      prevSegmentCount: prevRefs.length,
      nextSegmentCount: nextRefs.length,
      kept: kept.length,
      moved: moved.length,
      merged: merged.length,
      dropped: dropped.length,
      added: added.length,
      prevJunctionCount: prev.junctions.length,
      nextJunctionCount: next.junctions.length,
      junctionKept: junctionKept.length,
      junctionShifted: junctionShifted.length,
      junctionDropped: junctionDropped.length,
      junctionAdded: junctionAdded.length,
    },
    segments: {
      kept: kept as LayerTransitionDiff['segments']['kept'],
      moved: moved as LayerTransitionDiff['segments']['moved'],
      merged: merged as LayerTransitionDiff['segments']['merged'],
      dropped: dropped as LayerTransitionDiff['segments']['dropped'],
      added: added as LayerTransitionDiff['segments']['added'],
    },
    junctions: {
      kept: junctionKept as LayerTransitionDiff['junctions']['kept'],
      shifted: junctionShifted as LayerTransitionDiff['junctions']['shifted'],
      dropped: junctionDropped as LayerTransitionDiff['junctions']['dropped'],
      added: junctionAdded as LayerTransitionDiff['junctions']['added'],
    },
  }
}

export function compareAllLayerTransitions(
  layers: Partial<Record<LayerId, FlatLayer>>,
  options?: CompareLayerTransitionOptions,
): LayerTransitionDiff[] {
  const pairs: Array<[LayerId, LayerId]> = [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'E'],
  ]
  const diffs: LayerTransitionDiff[] = []
  for (const [from, to] of pairs) {
    const prev = layers[from]
    const next = layers[to]
    if (!prev || !next) continue
    if (prev.segments.length === 0 && next.segments.length === 0) continue
    diffs.push(compareLayerTransition(from, to, prev, next, options))
  }
  return diffs
}
