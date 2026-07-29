import type { ImprovementKind, LayerTransitionDiff, TransitionEffect } from './types.ts'
import { formatSegmentLine } from './segment-geometry.ts'

function junctionKindCorrection(
  from: string,
  to: string,
): boolean {
  if (from === to) return false
  // Ruis / over-segmentatie naar eenvoudiger junction
  if (from === 'X' && (to === 'L' || to === 'T' || to === 'I')) return true
  if (from === 'I' && (to === 'L' || to === 'T')) return true
  if (from === 'T' && to === 'L') return true
  return false
}

function junctionKindRegression(from: string, to: string): boolean {
  if (from === to) return false
  if (from === 'L' && (to === 'X' || to === 'I')) return true
  if (from === 'T' && to === 'X') return true
  return false
}

export function classifyTransitionEffects(
  transition: LayerTransitionDiff,
): NonNullable<LayerTransitionDiff['effects']> {
  const improvements: TransitionEffect[] = []
  const regressions: TransitionEffect[] = []
  let neutral = 0

  for (const item of transition.segments.merged) {
    const prevTotalLen = item.prev.reduce((sum, s) => sum + s.lengthPx, 0)
    const lengthDelta = item.next.lengthPx - prevTotalLen
    const category: ImprovementKind =
      item.dropReasonHint === 'likely_parallel_merge'
        ? 'parallel_centerlined'
        : 'collinear_consolidated'
    improvements.push({
      kind: 'improvement',
      category,
      detail: `${item.prev.length} fragmenten → 1 lijn (Δlen ${lengthDelta >= 0 ? '+' : ''}${lengthDelta}px)`,
      prevIndices: item.prevIndices,
      nextIndex: item.nextIndex,
      at: item.next.mid,
      lengthDeltaPx: lengthDelta,
      line: formatSegmentLine(item.next),
    })
  }

  neutral += transition.segments.kept.length

  for (const item of transition.segments.moved) {
    const lengthDelta = item.next.lengthPx - item.prev.lengthPx
    if (lengthDelta >= 5) {
      improvements.push({
        kind: 'improvement',
        category: 'extended_to_intersection',
        detail: `Verlengd ${item.prev.lengthPx}→${item.next.lengthPx}px (Δ=${lengthDelta}px, endpoint Δ=${item.endpointErrorPx}px)`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: item.next.mid,
        lengthDeltaPx: lengthDelta,
        endpointErrorPx: item.endpointErrorPx,
        line: `${formatSegmentLine(item.prev)} → ${formatSegmentLine(item.next)}`,
      })
    } else if (lengthDelta <= -5) {
      regressions.push({
        kind: 'regression',
        category: 'length_shrunk',
        detail: `Ingekort ${item.prev.lengthPx}→${item.next.lengthPx}px (Δ=${lengthDelta}px)`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: item.next.mid,
        lengthDeltaPx: lengthDelta,
        endpointErrorPx: item.endpointErrorPx,
        line: `${formatSegmentLine(item.prev)} → ${formatSegmentLine(item.next)}`,
      })
    } else if (item.endpointErrorPx >= 12) {
      regressions.push({
        kind: 'regression',
        category: 'lateral_drift',
        detail: `Zijwaarts verschoven Δ=${item.endpointErrorPx}px (len ${item.prev.lengthPx}→${item.next.lengthPx}px)`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: item.next.mid,
        endpointErrorPx: item.endpointErrorPx,
        line: `${formatSegmentLine(item.prev)} → ${formatSegmentLine(item.next)}`,
      })
    } else if (item.endpointErrorPx > 0) {
      improvements.push({
        kind: 'improvement',
        category: 'endpoint_snapped',
        detail: `Endpoint-snap Δ=${item.endpointErrorPx}px (len ${item.prev.lengthPx}→${item.next.lengthPx}px)`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: item.next.mid,
        endpointErrorPx: item.endpointErrorPx,
        line: `${formatSegmentLine(item.prev)} → ${formatSegmentLine(item.next)}`,
      })
    } else {
      neutral += 1
    }
  }

  for (const item of transition.segments.dropped) {
    if (
      item.dropReasonHint === 'likely_spur_prune' ||
      item.dropReasonHint === 'likely_length_filter'
    ) {
      improvements.push({
        kind: 'improvement',
        category: 'intentional_spur_prune',
        detail: `Spur/ruis verwijderd L=${item.prev.lengthPx}px`,
        prevIndex: item.prevIndex,
        at: item.prev.mid,
        line: formatSegmentLine(item.prev),
      })
    } else if (item.dropReasonHint === 'likely_collinear_merge') {
      // Fragment opgenomen in merge — geen regressie
      neutral += 1
    } else {
      regressions.push({
        kind: 'regression',
        category: 'segment_lost',
        detail: `Segment verloren L=${item.prev.lengthPx}px (${item.dropReasonHint})`,
        prevIndex: item.prevIndex,
        at: item.prev.mid,
        line: formatSegmentLine(item.prev),
      })
    }
  }

  for (const item of transition.segments.added) {
    if (item.next.lengthPx >= 15) {
      improvements.push({
        kind: 'improvement',
        category: 'gap_synthesized',
        detail: `Nieuw segment L=${item.next.lengthPx}px (synthese/extensie)`,
        nextIndex: item.nextIndex,
        at: item.next.mid,
        line: formatSegmentLine(item.next),
      })
    } else {
      neutral += 1
    }
  }

  for (const item of transition.junctions.shifted) {
    if (junctionKindCorrection(item.prev.kind, item.next.kind)) {
      improvements.push({
        kind: 'improvement',
        category: 'junction_kind_corrected',
        detail: `Junction ${item.prev.kind}→${item.next.kind} @ (${item.prev.x},${item.prev.y}) shift ${item.shiftPx}px`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: { x: item.next.x, y: item.next.y },
      })
    } else if (junctionKindRegression(item.prev.kind, item.next.kind)) {
      regressions.push({
        kind: 'regression',
        category: 'junction_regressed',
        detail: `Junction ${item.prev.kind}→${item.next.kind} @ (${item.prev.x},${item.prev.y})`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: { x: item.next.x, y: item.next.y },
      })
    } else if (item.shiftPx <= 3) {
      improvements.push({
        kind: 'improvement',
        category: 'endpoint_snapped',
        detail: `Junction snap ${item.shiftPx}px @ (${item.next.x},${item.next.y})`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: { x: item.next.x, y: item.next.y },
      })
    } else {
      regressions.push({
        kind: 'regression',
        category: 'junction_regressed',
        detail: `Junction verschoven ${item.shiftPx}px ${item.prev.kind}→${item.next.kind}`,
        prevIndex: item.prevIndex,
        nextIndex: item.nextIndex,
        at: { x: item.next.x, y: item.next.y },
      })
    }
  }

  neutral += transition.junctions.kept.length

  return {
    summary: {
      improvements: improvements.length,
      regressions: regressions.length,
      neutral,
    },
    improvements: sortEffects(improvements),
    regressions: sortEffects(regressions),
  }
}

function sortEffects(effects: TransitionEffect[]): TransitionEffect[] {
  return [...effects].sort((a, b) => {
    const aLen = Math.abs(a.lengthDeltaPx ?? a.endpointErrorPx ?? 0)
    const bLen = Math.abs(b.lengthDeltaPx ?? b.endpointErrorPx ?? 0)
    return bLen - aLen
  })
}

export function enrichTransitionsWithEffects(
  transitions: LayerTransitionDiff[],
): LayerTransitionDiff[] {
  return transitions.map((transition) => ({
    ...transition,
    effects: classifyTransitionEffects(transition),
  }))
}
