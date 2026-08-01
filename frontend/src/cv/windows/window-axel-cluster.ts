import { tally } from '@/core/diagnostics'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { areLinkedViaWallInkBridge } from '@/cv/walls/rooms/wall-ink-bridge'
import type { WindowAxelOrientation, WindowAxelRefBand, WindowAxelRejectReason } from './types'
import {
  type RootFace,
  axisSpan,
  centerPerp,
  median,
  overlapRatioAlongAxis,
  pickBestStripSample,
  resolveCentroidStripSample,
  resolveMaxStage1StripHeightPx,
  resolveStripSample,
  stripThickness,
  unionBbox,
} from './window-axel-strip-geometry'

/** Re-export: wit–inkt–wit hop (owner = `walls/rooms/wall-ink-bridge`). */
export { areLinkedViaWallInkBridge }

// ESC:R-12 (B)
/** Max max/min as-span binnen één Stage-1 k-tuple (weer lange rail×kort glas). */
const MAX_PAIR_AXIS_SPAN_RATIO = 1.5

export type CandidateLinkParams = {
  orientation: WindowAxelOrientation
  targetStripHeightPx: number
  /** Kozijn-as band — bepaalt max loodrechte gap (over inkt heen). */
  axisBandHeightPx: number
  /** Opening-wit adjacency (optioneel, zelden over inkt heen). */
  adjacency?: Map<number, Set<number>>
  /**
   * Wall-ink adjacency: clustering-bruggen over inkt/wall-faces.
   * Kandidaten blijven opening-wit; alleen de link-graph komt van wall-ink.
   */
  wallInkAdjacency?: Map<number, Set<number>>
  wallInkClassificationByLabel?: Map<number, RoomRasterClass>
}

// ESC:R-11 (E)
/** Of twee kandidaten een Stage-1 link hebben (geometric / adj / wall-bridge). */
function facesAreLinked(a: RootFace, b: RootFace, params: CandidateLinkParams): boolean {
  if (a.root === b.root) return false
  const maxPerpDelta = Math.max(3, params.axisBandHeightPx)
  const maxHeightDelta = Math.max(3, params.targetStripHeightPx * 0.7)
  const wallClass = params.wallInkClassificationByLabel ?? new Map<number, RoomRasterClass>()
  const overlap = overlapRatioAlongAxis(a, b, params.orientation)
  const centerDelta = Math.abs(
    centerPerp(a.bbox, params.orientation) - centerPerp(b.bbox, params.orientation),
  )
  const heightDelta = Math.abs(
    stripThickness(a, params.orientation) - stripThickness(b, params.orientation),
  )
  const directAdjacent =
    (params.adjacency?.get(a.root)?.has(b.root) ?? false) ||
    (params.wallInkAdjacency?.get(a.root)?.has(b.root) ?? false)
  const wallBridged =
    !!params.wallInkAdjacency &&
    areLinkedViaWallInkBridge({
      rootA: a.root,
      rootB: b.root,
      wallInkAdjacency: params.wallInkAdjacency,
      classificationByLabel: wallClass,
    })
  const geometricallyLinked =
    overlap >= 0.45 && centerDelta <= maxPerpDelta && heightDelta <= maxHeightDelta
  const adjacencyLinked = directAdjacent && overlap >= 0.1 && centerDelta <= maxPerpDelta * 1.6
  // ESC:R-13 (C)
  const wallBridgeLinked =
    wallBridged &&
    overlap >= 0.1 &&
    centerDelta <= Math.max(maxPerpDelta * 1.6, params.axisBandHeightPx * 4)
  if (wallBridgeLinked) tally('R-13', 'wall_bridge')
  else if (adjacencyLinked) tally('R-11', 'adjacency')
  else if (geometricallyLinked) tally('R-11', 'geometry')
  return adjacencyLinked || wallBridgeLinked || geometricallyLinked
}

function buildCandidateAdjacency(
  candidates: RootFace[],
  params: CandidateLinkParams,
): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>()
  const ensure = (root: number) => {
    let set = adj.get(root)
    if (!set) {
      set = new Set<number>()
      adj.set(root, set)
    }
    return set
  }
  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i]
    ensure(a.root)
    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j]
      if (!facesAreLinked(a, b, params)) continue
      ensure(a.root).add(b.root)
      ensure(b.root).add(a.root)
    }
  }
  return adj
}

function subsetIsConnected(roots: number[], adj: Map<number, Set<number>>): boolean {
  if (roots.length <= 1) return true
  const allowed = new Set(roots)
  const stack = [roots[0]]
  const seen = new Set<number>([roots[0]])
  while (stack.length > 0) {
    const cur = stack.pop()
    if (cur == null) continue
    for (const next of adj.get(cur) ?? []) {
      if (!allowed.has(next) || seen.has(next)) continue
      seen.add(next)
      stack.push(next)
    }
  }
  return seen.size === roots.length
}

/**
 * Stage 1: alle connected k-tuples (k = expectedStripCount).
 * Geen exclusive visited-clustering — één face mag in meerdere hyps.
 * Stage 2/3 filtert overlappende/foutieve opties.
 */
export function enumerateLinkedTuples(params: {
  candidates: RootFace[]
  orientation: WindowAxelOrientation
  targetStripHeightPx: number
  axisBandHeightPx: number
  expectedStripCount: number
  adjacency?: Map<number, Set<number>>
  wallInkAdjacency?: Map<number, Set<number>>
  wallInkClassificationByLabel?: Map<number, RoomRasterClass>
}): RootFace[][] {
  const {
    candidates,
    expectedStripCount,
    orientation,
    targetStripHeightPx,
    axisBandHeightPx,
    adjacency,
    wallInkAdjacency,
    wallInkClassificationByLabel,
  } = params
  if (expectedStripCount <= 1) {
    return candidates.map((candidate) => [candidate])
  }
  if (candidates.length < expectedStripCount) return []

  const linkParams: CandidateLinkParams = {
    orientation,
    targetStripHeightPx,
    axisBandHeightPx,
    adjacency,
    wallInkAdjacency,
    wallInkClassificationByLabel,
  }
  const byRoot = new Map(candidates.map((face) => [face.root, face]))
  const adj = buildCandidateAdjacency(candidates, linkParams)
  const roots = [...byRoot.keys()].sort((a, b) => a - b)
  const k = expectedStripCount
  const tuples: RootFace[][] = []

  if (k === 2) {
    for (let i = 0; i < roots.length; i += 1) {
      const a = roots[i]
      for (const b of adj.get(a) ?? []) {
        if (b <= a) continue
        const fa = byRoot.get(a)
        const fb = byRoot.get(b)
        if (fa && fb) tuples.push([fa, fb])
      }
    }
    return tuples
  }

  // k >= 3: alle combinations, behoud alleen connected subgraphs.
  const n = roots.length
  const pick: number[] = []
  const walk = (start: number, chosen: number) => {
    if (chosen === k) {
      if (subsetIsConnected(pick, adj)) {
        tuples.push(pick.map((root) => byRoot.get(root)!))
      }
      return
    }
    for (let i = start; i <= n - (k - chosen); i += 1) {
      pick.push(roots[i])
      walk(i + 1, chosen + 1)
      pick.pop()
    }
  }
  walk(0, 0)
  return tuples
}

export type ClusterScore =
  | {
      accepted: true
      score: number
      axisSpanPx: number
      actualStripCount: number
      actualStripHeightsPx: number[]
    }
  | {
      accepted: false
      reason: WindowAxelRejectReason
      axisSpanPx: number
      actualStripCount: number
      actualStripHeightsPx: number[]
    }

/**
 * Strikte score (o.a. stripCount=1): height/count mismatch = reject.
 */
function scoreCluster(params: { cluster: RootFace[]; ref: WindowAxelRefBand }): ClusterScore {
  const { cluster, ref } = params
  const bbox = unionBbox(cluster)
  const span = axisSpan(bbox, ref.orientation)
  const bandSample = resolveStripSample({
    cluster,
    orientation: ref.orientation,
  })
  const centroidSample = resolveCentroidStripSample({
    cluster,
    orientation: ref.orientation,
    targetStripHeightPx: ref.targetStripHeightPx,
  })
  // ESC:R-09 (A)
  const sampled = pickBestStripSample({
    expectedStripCount: ref.stripCount,
    samples: [bandSample, centroidSample],
  })
  const heights = sampled.stripHeightsPx
  if (sampled.actualStripCount !== ref.stripCount) {
    return {
      accepted: false,
      reason: 'strip_count_mismatch',
      axisSpanPx: span,
      actualStripCount: sampled.actualStripCount,
      actualStripHeightsPx: heights,
    }
  }
  if (heights.length <= 0) {
    return {
      accepted: false,
      reason: 'invalid_axis_span',
      axisSpanPx: span,
      actualStripCount: sampled.actualStripCount,
      actualStripHeightsPx: [],
    }
  }
  // ESC:R-10 (A)
  // Hoogteband ~75%: na floor-kalibratie (tilt-bbox) blijven ook dunnere
  // as-aligned strips elders binnen bereik (target 11 ↔ median 3).
  const tolerance = Math.max(2, ref.targetStripHeightPx * 0.75)
  const medianHeight = median(heights)
  if (Math.abs(medianHeight - ref.targetStripHeightPx) > tolerance) {
    tally('R-10', 'strip_height_mismatch')
    return {
      accepted: false,
      reason: 'strip_height_mismatch',
      axisSpanPx: span,
      actualStripCount: sampled.actualStripCount,
      actualStripHeightsPx: heights,
    }
  }
  const withinMedian = heights.filter((h) => Math.abs(h - medianHeight) <= tolerance).length
  // Minimaal 2/3 van de strips moet binnen de mediane band vallen.
  const requiredInliers = Math.max(1, Math.ceil(ref.stripCount * (2 / 3)))
  if (withinMedian < requiredInliers) {
    return {
      accepted: false,
      reason: 'strip_height_spread',
      axisSpanPx: span,
      actualStripCount: sampled.actualStripCount,
      actualStripHeightsPx: heights,
    }
  }

  const minH = heights[0] ?? 0
  const maxH = heights[heights.length - 1] ?? 0
  // Hard guard tegen extreme mix (bijv. 5, 10, 20).
  if (maxH - minH > Math.max(tolerance * 3, ref.targetStripHeightPx * 0.6)) {
    return {
      accepted: false,
      reason: 'strip_height_spread',
      axisSpanPx: span,
      actualStripCount: sampled.actualStripCount,
      actualStripHeightsPx: heights,
    }
  }
  if (!(span > 0)) {
    return {
      accepted: false,
      reason: 'invalid_axis_span',
      axisSpanPx: span,
      actualStripCount: sampled.actualStripCount,
      actualStripHeightsPx: heights,
    }
  }
  const meanDiff =
    heights.reduce((sum, h) => sum + Math.abs(h - ref.targetStripHeightPx), 0) / heights.length
  const score = span / Math.max(1, ref.targetStripHeightPx) - meanDiff
  return {
    accepted: true,
    score,
    axisSpanPx: span,
    actualStripCount: sampled.actualStripCount,
    actualStripHeightsPx: heights,
  }
}

/**
 * Stage 1 multi-strip: linked k-tuple.
 * Per-strip dikte vs target (hard) — as-band is voor Stage-3 stack-gap, niet voor strip-kandidaten.
 * As-span uniformiteit weren lange rail×kort glas.
 */
export function scoreStage1Tuple(params: {
  cluster: RootFace[]
  ref: WindowAxelRefBand
}): ClusterScore {
  const { cluster, ref } = params
  if (ref.stripCount <= 1) {
    return scoreCluster(params)
  }
  const bbox = unionBbox(cluster)
  const span = axisSpan(bbox, ref.orientation)
  const heights = cluster
    .map((face) => stripThickness(face, ref.orientation))
    .filter((h) => h > 0)
    .sort((a, b) => a - b)
  if (!(span > 0) || heights.length <= 0) {
    return {
      accepted: false,
      reason: 'invalid_axis_span',
      axisSpanPx: span,
      actualStripCount: cluster.length,
      actualStripHeightsPx: heights,
    }
  }
  // As-span uniformiteit: korte glas + mega-rail (4 ramen breed) mag geen hyp worden.
  const axisSpans = cluster
    .map((face) => axisSpan(face.bbox, ref.orientation))
    .filter((s) => s > 0)
    .sort((a, b) => a - b)
  const minAxis = axisSpans[0] ?? 0
  const maxAxis = axisSpans[axisSpans.length - 1] ?? 0
  if (minAxis > 0 && maxAxis / minAxis > MAX_PAIR_AXIS_SPAN_RATIO) {
    tally('R-12', 'axis_span_spread')
    return {
      accepted: false,
      reason: 'axis_span_spread',
      axisSpanPx: span,
      actualStripCount: cluster.length,
      actualStripHeightsPx: heights,
    }
  }
  // Per-strip vs target (±75%, min 2px) — 36px-panelen bij target 6 falen hier.
  const tolerance = Math.max(2, ref.targetStripHeightPx * 0.75)
  const maxStripH = resolveMaxStage1StripHeightPx(ref.targetStripHeightPx)
  const medianHeight = median(heights)
  if (Math.abs(medianHeight - ref.targetStripHeightPx) > tolerance) {
    return {
      accepted: false,
      reason: 'strip_height_mismatch',
      axisSpanPx: span,
      actualStripCount: cluster.length,
      actualStripHeightsPx: heights,
    }
  }
  if (heights.some((h) => h > maxStripH)) {
    return {
      accepted: false,
      reason: 'strip_height_mismatch',
      axisSpanPx: span,
      actualStripCount: cluster.length,
      actualStripHeightsPx: heights,
    }
  }
  const withinMedian = heights.filter((h) => Math.abs(h - medianHeight) <= tolerance).length
  const requiredInliers = Math.max(1, Math.ceil(ref.stripCount * (2 / 3)))
  if (withinMedian < requiredInliers) {
    return {
      accepted: false,
      reason: 'strip_height_spread',
      axisSpanPx: span,
      actualStripCount: cluster.length,
      actualStripHeightsPx: heights,
    }
  }
  const meanDiff =
    heights.reduce((sum, h) => sum + Math.abs(h - ref.targetStripHeightPx), 0) / heights.length
  const score = span / Math.max(1, ref.targetStripHeightPx) - meanDiff
  return {
    accepted: true,
    score,
    axisSpanPx: span,
    actualStripCount: cluster.length,
    actualStripHeightsPx: heights,
  }
}
