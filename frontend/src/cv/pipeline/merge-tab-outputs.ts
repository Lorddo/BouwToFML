import type { ExtractionOutput } from '@/core/extraction'
import type { DetectionLayerId } from '@/cv/preprocess/layer-preprocess'
import { semanticAsSegments } from '@/cv/walls/rooms/build-semantic-walls-source'

export type TabDetectionOutputs = Record<DetectionLayerId, ExtractionOutput | null>

export type ResultViewTab = DetectionLayerId | 'vector'

export function emptyTabOutputs(): TabDetectionOutputs {
  return {
    walls: null,
  }
}

/**
 * Combineert tab-outputs voor Result/FML.
 * Prefereert `semanticWallGraph` → segments. Debug/`pipelineV3Debug` blijft
 * passthrough voor Result-overlays — niet gelezen door `extractionToPlan`.
 */
export function mergeTabOutputs(outputs: TabDetectionOutputs): ExtractionOutput | null {
  const base = outputs.walls
  if (!base) return null
  const semanticSegments = base.semanticWallGraph ? semanticAsSegments(base.semanticWallGraph) : []
  const mergedSegments = semanticSegments.length > 0 ? semanticSegments : (base.segments ?? [])

  return {
    ...base,
    segments: mergedSegments,
    wallGraph: base.wallGraph,
    semanticWallGraph: base.semanticWallGraph,
    wallMatches: base.wallMatches ?? [],
    debugRawInk: base.debugRawInk,
    debugLines: base.debugLines,
    debugSkeleton: base.debugSkeleton,
    debugGaps: base.debugGaps,
    pipelineV3Debug: base.pipelineV3Debug,
    roomWallMaskRle: base.roomWallMaskRle,
    candidates: [],
    meta: base.meta,
  }
}

export function tabFromDetectTargets(targets: {
  walls?: boolean
  wallJunctionStrategy?: 'room_first'
}): DetectionLayerId | null {
  if (!targets.walls) return null
  return 'walls'
}
