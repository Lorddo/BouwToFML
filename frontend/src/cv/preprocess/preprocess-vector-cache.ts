import type { ExtractionOutput } from '@/core/extraction'
import type { WallSignature } from '@/core/extraction/geometric-signature'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from '@/cv/port/wallGraph'
import { buildJunctionGraph, graphToSegments } from '@/cv/port/wallJunctionGraph'
import { extractInkLineSegments } from '@/cv/walls/ink-line-segments'
import { asSegmentCandidates } from '@/cv/walls/strategy-utils'

export interface PreprocessVectorCacheMeta {
  rawInkCount: number
  simplifiedInkCount: number
  skeletonCount: number
}

/** Generieke vector-debug uit stap-2 B/W (werkschaal of origineel — caller schaalt). */
export interface PreprocessVectorCache {
  workScale: number
  rawInk: Segment[]
  simplifiedInk: Segment[]
  skeleton: Segment[]
  meta: PreprocessVectorCacheMeta
}

function createGenericWallSignature(wallKernelOverridePx?: number): WallSignature {
  const thickness = Math.max(6, wallKernelOverridePx ?? 14)
  return {
    renderStyle: 'parallel_lines',
    thicknessPx: thickness,
    parallelSpacingPx: thickness,
    minLengthPx: 5,
    angleToleranceDeg: 12,
    rejectDiagonalHatch: false,
    closeKernelPx: thickness,
  }
}

/**
 * Bouw generieke vector-debug op basis van B/W muur-onderlegger.
 * Geen templates, signatures of detectiestrategie — alleen ruwe inkt → lijnen/skeleton.
 */
export function buildPreprocessVectorCache(
  cv: OpenCV,
  mat: OpenCV['Mat'],
  options?: { wallKernelOverridePx?: number },
): Omit<PreprocessVectorCache, 'workScale'> {
  const genericSig = createGenericWallSignature(options?.wallKernelOverridePx)
  const { rawInk, simplifiedInk } = extractInkLineSegments(cv, mat)
  const graphSnapPx = Math.max(6, Math.round(genericSig.thicknessPx * 0.45))
  const skeleton = graphToSegments(buildJunctionGraph(simplifiedInk, graphSnapPx))

  return {
    rawInk,
    simplifiedInk,
    skeleton,
    meta: {
      rawInkCount: rawInk.length,
      simplifiedInkCount: simplifiedInk.length,
      skeletonCount: skeleton.length,
    },
  }
}

/** Koppel stap-2 vector-cache aan detectie-output voor export/rapport. */
export function attachPreprocessVectorCacheToOutput(
  output: ExtractionOutput,
  cache: PreprocessVectorCache,
): ExtractionOutput {
  return {
    ...output,
    debugRawInk: asSegmentCandidates(cache.rawInk, 0.65),
    debugSkeleton: asSegmentCandidates(cache.skeleton, 0.65),
    meta: {
      extractorId: output.meta?.extractorId ?? 'geometry-lbe',
      elapsedMs: output.meta?.elapsedMs ?? 0,
      ...output.meta,
      rawInkVectorCount: cache.meta.rawInkCount,
    },
  }
}
