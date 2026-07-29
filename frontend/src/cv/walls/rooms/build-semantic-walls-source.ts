import type { ExtractionOutput, RoomWallSemanticGraph, SegmentCandidate } from '@/core/extraction'
import type { PipelineLayerDebug } from '@/core/extraction/types'
import {
  buildJunctionGraph,
  computeJunctionAnglesDeg,
  directionsAtNode,
  type WallGraph,
} from '@/cv/port/wallJunctionGraph'
import { SEMANTIC_JUNCTION_EPS_PX, SEMANTIC_SEGMENT_CONFIDENCE } from './semantic-wall-constants'

export interface SemanticGraphFromFmlLayer {
  semantic: RoomWallSemanticGraph
  /** Zelfde `WallGraph` als de semantic-edges; één `buildJunctionGraph`-pass. */
  wallGraph: WallGraph
}

/**
 * FML-bronlaag voor semantic walls.
 * V3-only: L10 alleen bij `fmlReady` (geen L8/L9 fallback).
 */
export function resolveFmlSourceLayer(walls: ExtractionOutput): PipelineLayerDebug | undefined {
  const debug = walls.pipelineV3Debug
  if (!debug) return undefined
  if (debug.summary?.fmlReady !== true) return undefined
  if ((debug.layers.layer10?.segments.length ?? 0) > 0) return debug.layers.layer10
  return undefined
}

/** True wanneer `resolveFmlSourceLayer` minstens één segment levert. */
export function hasFmlSemanticSource(walls: ExtractionOutput): boolean {
  return (resolveFmlSourceLayer(walls)?.segments.length ?? 0) > 0
}

export function buildSemanticGraphFromFmlLayer(walls: ExtractionOutput): SemanticGraphFromFmlLayer {
  const source = resolveFmlSourceLayer(walls)
  const sourceSegments = (source?.segments ?? []).map((segment) => ({
    a: { x: segment.a.x, y: segment.a.y },
    b: { x: segment.b.x, y: segment.b.y },
    templateIndex: segment.templateIndex,
  }))
  const wallGraph = buildJunctionGraph(sourceSegments, SEMANTIC_JUNCTION_EPS_PX)
  const junctions = wallGraph.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    kind: node.kind,
    anglesDeg: computeJunctionAnglesDeg(
      node.kind,
      directionsAtNode(node.id, wallGraph.edges, wallGraph.nodes),
    ),
    source: 'raw' as const,
  }))
  const angleAtLeast25Count = (source?.junctions ?? []).filter(
    (junction) => junction.angleDeg >= 25,
  ).length
  return {
    semantic: {
      segments: wallGraph.edges.map((edge) => {
        return {
          a: { x: edge.segment.a.x, y: edge.segment.a.y },
          b: { x: edge.segment.b.x, y: edge.segment.b.y },
          thicknessPxMax:
            Number((edge.segment as { thicknessPx?: number }).thicknessPx) > 0
              ? Number((edge.segment as { thicknessPx?: number }).thicknessPx)
              : 0,
          junctionAId: edge.a,
          junctionBId: edge.b,
        }
      }),
      junctions,
      meta: {
        rawJunctionCount: source?.junctions.length ?? junctions.length,
        semanticJunctionCount: junctions.length,
        cornerClustersMerged: 0,
        collinearSegmentsMerged: 0,
        angleAtLeast25Count,
      },
    },
    wallGraph,
  }
}

export function semanticAsSegments(graph: RoomWallSemanticGraph): SegmentCandidate[] {
  return graph.segments.map((segment) => ({
    type: 'wall' as const,
    a: { ...segment.a },
    b: { ...segment.b },
    confidence: SEMANTIC_SEGMENT_CONFIDENCE,
    thicknessPx: segment.thicknessPxMax,
  }))
}

export function resolveFmlSourceJunctionCount(walls: ExtractionOutput): number {
  return resolveFmlSourceLayer(walls)?.junctions.length ?? 0
}
