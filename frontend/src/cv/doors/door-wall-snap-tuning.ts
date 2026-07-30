import type { DoorOpeningAxis } from './types'

// ESC:D-49 (A)
/** L11 snap-tolerances — waarden ongewijzigd t.o.v. pre-refactor literals. */
export const DOOR_WALL_SNAP_TUNING = {
  thinBBoxRatio: 1.45,
  maskInkThreshold: 128,
  spanGapToleranceMinPx: 6,
  spanGapThicknessFallbackPx: 6,
  spanGapThicknessFactor: 1.25,
  relaxedSpanGapSideFactor: 0.75,
  directionSlackMinPx: 2,
  directionSlackThicknessFallbackPx: 4,
  directionSlackThicknessFactor: 0.5,
  relaxedOppositeThicknessFallbackPx: 6,
  relaxedOppositeThicknessFactor: 1.75,
  maxSnapFloorPx: 8,
  maxSnapThicknessFactor: 1.5,
  maxSnapDoorDepthFactor: 0.5,
  maxSnapProximityFactor: 1.1,
  relaxedMaxSnapThicknessFallbackPx: 8,
  relaxedMaxSnapThicknessFactor: 2.5,
  relaxedMaxSnapCapThicknessFallbackPx: 8,
  relaxedMaxSnapCapThicknessFactor: 4.5,
  relaxedMaxSnapCapDoorDepthFactor: 0.5,
  relaxedSpanGapVsMaxSnapFactor: 2,
  segmentScoreSpanGapWeight: 1.5,
  segmentScoreOverlapWeight: 0.5,
  noTouchProximityPenaltyFactor: 0.35,
  missingTouchPenaltyFloorPx: 20,
  missingTouchProximityFactor: 0.8,
  touchCoverageBonusFactor: 8,
  contactDepthFallbackPx: 2,
  contactDepthThicknessFactor: 0.5,
  searchDepthThicknessFactor: 2,
  expandThicknessFallbackPx: 8,
  expandMinPx: 4,
  growHopCap: 8,
  /** Verwerp segment als deur-centroid verder is dan factor × dikte (seg 19-achtige FP). */
  maxCentroidSegmentDistThicknessFactor: 4,
  maxCentroidSegmentDistFloorPx: 48,
} as const

export type DoorSide = 'left' | 'right' | 'top' | 'bottom'

export type SideContact = {
  side: DoorSide
  axis: DoorOpeningAxis
  outwardSign: -1 | 1
  contactCount: number
  sampleCount: number
  sideCoverage: number
  touchCoverage: number
  score: number
  proximityDistancePx: number
  sideLength: number
  sideMid: { x: number; y: number }
}

export type { BBoxBounds } from './door-geometry-utils'
