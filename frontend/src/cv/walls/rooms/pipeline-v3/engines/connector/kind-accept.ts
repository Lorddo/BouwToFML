import type { Segment } from '@/cv/port/wallGraph'
import {
  buildConnectorJunctionGraph,
  kindCountsFromGraph,
  lJunctionsPreservedInGraph,
  lRefsFromGraph,
  txJunctionsPreservedInGraph,
  txRefsFromGraph,
} from './junction-guard'

/**
 * Per-candidate kind gate (mid-state → after one repair).
 * Position-based: baseline T/X within radius; L must not become I locally.
 */
export function validateJunctionKindsPreserved(
  before: Segment[],
  after: Segment[],
  radiusPx: number,
): { ok: boolean; reason?: string } {
  // Bouw de connector-graph per set één keer (was 6× per call: 3× before + 3× after).
  const beforeGraph = buildConnectorJunctionGraph(before)
  const afterGraph = buildConnectorJunctionGraph(after)
  const beforeKinds = kindCountsFromGraph(beforeGraph)
  const afterKinds = kindCountsFromGraph(afterGraph)

  if (afterKinds.I > beforeKinds.I) {
    return {
      ok: false,
      reason: `I explosion ${beforeKinds.I}→${afterKinds.I}`,
    }
  }
  if (afterKinds.X < beforeKinds.X) {
    return {
      ok: false,
      reason: `X downgrade ${beforeKinds.X}→${afterKinds.X}`,
    }
  }

  const txBaseline = txRefsFromGraph(beforeGraph)
  if (!txJunctionsPreservedInGraph(txBaseline, afterGraph, radiusPx)) {
    return { ok: false, reason: 'baseline T/X junction not preserved within radius' }
  }

  const lBaseline = lRefsFromGraph(beforeGraph)
  if (!lJunctionsPreservedInGraph(lBaseline, afterGraph, radiusPx)) {
    return { ok: false, reason: 'baseline L junction became I' }
  }

  return { ok: true }
}

/**
 * Face-level accept L5→L6 after the full connector loop.
 * T count may drop via legitimate consolidation across many candidates;
 * only guard I-explosion and X downgrade (not connectivity, not full T position map).
 */
export function acceptLayer6FaceKinds(
  before: Segment[],
  after: Segment[],
): { ok: boolean; reason?: string } {
  const beforeKinds = kindCountsFromGraph(buildConnectorJunctionGraph(before))
  const afterKinds = kindCountsFromGraph(buildConnectorJunctionGraph(after))
  if (afterKinds.I > beforeKinds.I) {
    return {
      ok: false,
      reason: `face I explosion ${beforeKinds.I}→${afterKinds.I}`,
    }
  }
  if (afterKinds.X < beforeKinds.X) {
    return {
      ok: false,
      reason: `face X downgrade ${beforeKinds.X}→${afterKinds.X}`,
    }
  }
  return { ok: true }
}
