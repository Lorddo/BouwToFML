import type { ExtractionOutput, SegmentCandidate } from '@/core/extraction'
import type { WallLayerResult } from '@/cv/layers/types'
import type { WallGraph } from '@/cv/port/wallJunctionGraph'

function cloneSegments(segments: SegmentCandidate[]): SegmentCandidate[] {
  return segments.map((s) => ({
    ...s,
    a: { ...s.a },
    b: { ...s.b },
  }))
}

/**
 * Resultaat-shell na geometry-pipeline.
 *
 * Productie (`geometry-pipeline`) roept dit **zonder** `wall`/`wallGraph` —
 * `segments` blijven dan leeg by design. FML-muren komen post-finalize via
 * `buildSemanticWallsForOutput` (L10 + `fmlReady`), niet via compose.
 *
 * Optionele `wall`/`wallGraph` blijven voor legacy/tests; injecteer hier geen
 * L10-segments (dat omzeilt de semantic gate).
 *
 * Openings komen via face-overlay (deuren/ramen), niet via geometry-pipeline.
 */
export function composeLayers(params: {
  extractorId: string
  elapsedMs: number
  workScale?: number
  /** Legacy/optioneel — productie-pipeline geeft dit niet door. */
  wall?: WallLayerResult
  /** Legacy/optioneel — productie-pipeline geeft dit niet door. */
  wallGraph?: WallGraph
}): ExtractionOutput {
  const { extractorId, elapsedMs, workScale, wall, wallGraph } = params

  return {
    candidates: [],
    segments: wall ? cloneSegments(wall.segmentCandidates) : [],
    wallGraph,
    wallMatches: wall?.wallMatches ?? [],
    meta: {
      extractorId,
      elapsedMs,
      workScale,
      templateKernels: wall?.templateKernels,
    },
    masks: [],
  }
}
