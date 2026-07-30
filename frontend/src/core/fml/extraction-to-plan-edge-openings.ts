import {
  type Point2D,
  projectPointToSegmentT,
  widthCmBetweenPoints,
} from './extraction-to-plan-geom'

// ESC:X-09 (E)
/** Filter openings voor één edge + mark consumed (gedeeld L12/L14). */
export function filterOpeningsForEdge<T extends { segmentIndex: number }>(params: {
  openings: T[]
  getId: (opening: T) => string
  semanticSegmentIndex: number | null
  fallbackEdgeIndex: number
  consumedIds: Set<string>
}): T[] {
  if (params.openings.length <= 0) return []
  const matched = params.openings.filter((opening) => {
    if (params.consumedIds.has(params.getId(opening))) return false
    if (params.semanticSegmentIndex != null) {
      return opening.segmentIndex === params.semanticSegmentIndex
    }
    return opening.segmentIndex === params.fallbackEdgeIndex
  })
  for (const opening of matched) {
    params.consumedIds.add(params.getId(opening))
  }
  return matched
}

/** Projectie op edge → tMid + widthCm (deur merge blijft apart via interval t0/t1). */
export function openingSpanOnEdge(
  start: Point2D,
  end: Point2D,
  edgeSegment: { a: Point2D; b: Point2D },
  pxPerMmX: number,
  pxPerMmY: number,
): { tMid: number; widthCm: number } {
  const t0 = projectPointToSegmentT(start, edgeSegment.a, edgeSegment.b)
  const t1 = projectPointToSegmentT(end, edgeSegment.a, edgeSegment.b)
  return {
    tMid: (Math.min(t0, t1) + Math.max(t0, t1)) / 2,
    widthCm: Math.round(widthCmBetweenPoints(start, end, pxPerMmX, pxPerMmY) * 100) / 100,
  }
}
