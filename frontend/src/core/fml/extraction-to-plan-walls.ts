import type { ExtractionOutput, SegmentCandidate } from '@/core/extraction'
import { buildJunctionGraph, type WallGraph } from '@/cv/port/wallJunctionGraph'
import { SEMANTIC_JUNCTION_EPS_PX } from '@/cv/walls/rooms/semantic-wall-constants'
import type { Point2D } from './extraction-to-plan-geom'

export function asWallSegments(segments: SegmentCandidate[] | undefined): Array<{
  a: Point2D
  b: Point2D
  templateIndex?: number
}> {
  if (!segments?.length) return []
  return segments.map((segment) => ({
    a: { x: segment.a.x, y: segment.a.y },
    b: { x: segment.b.x, y: segment.b.y },
    templateIndex: segment.templateIndex,
  }))
}

export function resolveGraph(output: ExtractionOutput): WallGraph {
  if (output.semanticWallGraph?.segments?.length) {
    const semanticSegments = output.semanticWallGraph.segments.map((segment) => ({
      a: { x: segment.a.x, y: segment.a.y },
      b: { x: segment.b.x, y: segment.b.y },
    }))
    return buildJunctionGraph(semanticSegments, SEMANTIC_JUNCTION_EPS_PX)
  }
  if (output.wallGraph) return output.wallGraph
  const fallbackSegments = asWallSegments(output.segments)
  return buildJunctionGraph(fallbackSegments, SEMANTIC_JUNCTION_EPS_PX)
}

export function resolveThicknessCm(
  output: ExtractionOutput,
  templateIndex: number | undefined,
  pxPerMmX: number,
  pxPerMmY: number,
  defaultThicknessCm: number,
): number {
  const kernels = output.meta?.templateKernels
  if (!kernels?.length) return defaultThicknessCm
  const index = templateIndex ?? 0
  const kernelPx = kernels[index] ?? kernels[0]
  if (!Number.isFinite(kernelPx) || kernelPx <= 0) return defaultThicknessCm
  const pxPerMmAvg = (pxPerMmX + pxPerMmY) / 2
  if (!Number.isFinite(pxPerMmAvg) || pxPerMmAvg <= 0) return defaultThicknessCm
  return Math.max(1, kernelPx / pxPerMmAvg / 10)
}

export function matchSemanticSegmentByEdge(params: {
  semanticSegments: NonNullable<ExtractionOutput['semanticWallGraph']>['segments'] | undefined
  edgeSegment: { a: Point2D; b: Point2D }
}): {
  segment: NonNullable<ExtractionOutput['semanticWallGraph']>['segments'][number]
  index: number
} | null {
  const segments = params.semanticSegments ?? []
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!
    const direct =
      Math.abs(segment.a.x - params.edgeSegment.a.x) <= 2 &&
      Math.abs(segment.a.y - params.edgeSegment.a.y) <= 2 &&
      Math.abs(segment.b.x - params.edgeSegment.b.x) <= 2 &&
      Math.abs(segment.b.y - params.edgeSegment.b.y) <= 2
    if (direct) return { segment, index: i }
    const reverse =
      Math.abs(segment.a.x - params.edgeSegment.b.x) <= 2 &&
      Math.abs(segment.a.y - params.edgeSegment.b.y) <= 2 &&
      Math.abs(segment.b.x - params.edgeSegment.a.x) <= 2 &&
      Math.abs(segment.b.y - params.edgeSegment.a.y) <= 2
    if (reverse) return { segment, index: i }
  }
  return null
}
