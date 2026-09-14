import { tally } from '@/core/diagnostics'
import type { Opening } from './types'
import type { OpeningKind } from './opening-kind-catalog'
import type { Layer14WindowForPlan } from './extraction-to-plan-types'
import type { Point2D } from './extraction-to-plan-geom'
import { filterOpeningsForEdge, openingSpanOnEdge } from './extraction-to-plan-edge-openings'

function resolveWindowOpeningKind(fmlRefId: string | undefined): OpeningKind {
  if (fmlRefId === 'window.double') return 'window.double'
  if (fmlRefId === 'window.triple') return 'window.triple'
  if (typeof fmlRefId === 'string' && fmlRefId.startsWith('window.')) {
    return fmlRefId as OpeningKind
  }
  return 'window.single'
}

export function mapLayer14WindowsToOpenings(params: {
  layer14Windows: Layer14WindowForPlan[]
  semanticSegmentIndex: number | null
  fallbackEdgeIndex: number
  edgeSegment: { a: Point2D; b: Point2D }
  pxPerMmX: number
  pxPerMmY: number
  defaultWindowHeightCm: number
  defaultWindowSillZCm: number
  consumedWindowIds: Set<string>
}): Opening[] {
  const sourceWindows = filterOpeningsForEdge({
    openings: params.layer14Windows,
    getId: (window) => window.windowId,
    semanticSegmentIndex: params.semanticSegmentIndex,
    fallbackEdgeIndex: params.fallbackEdgeIndex,
    consumedIds: params.consumedWindowIds,
  })
  if (sourceWindows.length <= 0) return []

  return sourceWindows.map((window) => {
    const span = openingSpanOnEdge(
      window.openingStartPx,
      window.openingEndPx,
      params.edgeSegment,
      params.pxPerMmX,
      params.pxPerMmY,
    )
    // ESC:X-11 (E) — geen mirrored-veld op ramen; export altijd [0,0] via buildFmlV3.
    tally('X-11', 'no_mirrored')
    return {
      id: crypto.randomUUID(),
      kind: resolveWindowOpeningKind(window.fmlRefId),
      type: 'window',
      t: span.tMid,
      width: span.widthCm,
      z: params.defaultWindowSillZCm,
      z_height: params.defaultWindowHeightCm,
    } satisfies Opening
  })
}
