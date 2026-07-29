import type {
  RoomJunctionRecord,
  SegmentRecord,
  SemanticWallGraphRecord,
  WallVariantExport,
} from '../examples-report'

export const LAYER_DEBUG_VERSION = 1 as const

export type LayerId = 'A' | 'B' | 'C' | 'D' | 'E'

/** Legacy A–E of V2/V3 `layer1`…`layer10`. */
export type LayerTransitionId = LayerId | string

export interface FlatLayer {
  segments: SegmentRecord[]
  junctions: RoomJunctionRecord[]
  faceCount?: number
  semanticMeta?: SemanticWallGraphRecord['meta']
}

export interface LayerCounts {
  faceCount?: number
  segmentCount: number
  junctionCount: number
  junctionKinds: Record<RoomJunctionRecord['kind'], number>
}

export interface SegmentRef {
  index: number
  a: { x: number; y: number }
  b: { x: number; y: number }
  lengthPx: number
  mid: { x: number; y: number }
}

export type DropReasonHint =
  | 'unmatched'
  | 'likely_spur_prune'
  | 'likely_length_filter'
  | 'likely_collinear_merge'
  | 'likely_parallel_merge'
  | 'inferred_moved'

export type ImprovementKind =
  | 'collinear_consolidated'
  | 'parallel_centerlined'
  | 'extended_to_intersection'
  | 'endpoint_snapped'
  | 'junction_kind_corrected'
  | 'intentional_spur_prune'
  | 'gap_synthesized'

export type RegressionKind =
  | 'segment_lost'
  | 'length_shrunk'
  | 'junction_regressed'
  | 'lateral_drift'

export interface TransitionEffect {
  kind: 'improvement' | 'regression'
  category: ImprovementKind | RegressionKind
  detail: string
  prevIndex?: number
  prevIndices?: number[]
  nextIndex?: number
  at?: { x: number; y: number }
  lengthDeltaPx?: number
  endpointErrorPx?: number
  line?: string
}

export interface KeptSegmentDiff {
  kind: 'kept'
  prevIndex: number
  nextIndex: number
  endpointErrorPx: number
  prev: SegmentRef
  next: SegmentRef
}

export interface MovedSegmentDiff {
  kind: 'moved'
  prevIndex: number
  nextIndex: number
  endpointErrorPx: number
  prev: SegmentRef
  next: SegmentRef
  dropReasonHint: 'inferred_moved'
}

export interface MergedSegmentDiff {
  kind: 'merged'
  prevIndices: number[]
  nextIndex: number
  prev: SegmentRef[]
  next: SegmentRef
  dropReasonHint: 'likely_collinear_merge' | 'likely_parallel_merge'
}

export interface DroppedSegmentDiff {
  kind: 'dropped'
  prevIndex: number
  prev: SegmentRef
  dropReasonHint: DropReasonHint
}

export interface AddedSegmentDiff {
  kind: 'added'
  nextIndex: number
  next: SegmentRef
}

export type SegmentTransitionItem =
  | KeptSegmentDiff
  | MovedSegmentDiff
  | MergedSegmentDiff
  | DroppedSegmentDiff
  | AddedSegmentDiff

export interface JunctionRef {
  index: number
  x: number
  y: number
  kind: RoomJunctionRecord['kind']
  angleDeg?: number
}

export interface JunctionKeptDiff {
  kind: 'kept'
  prevIndex: number
  nextIndex: number
  shiftPx: number
  kindChanged: boolean
  prev: JunctionRef
  next: JunctionRef
}

export interface JunctionShiftedDiff {
  kind: 'shifted'
  prevIndex: number
  nextIndex: number
  shiftPx: number
  kindChanged: boolean
  prev: JunctionRef
  next: JunctionRef
}

export interface JunctionDroppedDiff {
  kind: 'dropped'
  prevIndex: number
  prev: JunctionRef
}

export interface JunctionAddedDiff {
  kind: 'added'
  nextIndex: number
  next: JunctionRef
}

export type JunctionTransitionItem =
  | JunctionKeptDiff
  | JunctionShiftedDiff
  | JunctionDroppedDiff
  | JunctionAddedDiff

export interface LayerTransitionDiff {
  from: LayerTransitionId
  to: LayerTransitionId
  tolerancePx: number
  summary: {
    prevSegmentCount: number
    nextSegmentCount: number
    kept: number
    moved: number
    merged: number
    dropped: number
    added: number
    prevJunctionCount: number
    nextJunctionCount: number
    junctionKept: number
    junctionShifted: number
    junctionDropped: number
    junctionAdded: number
    improvements?: number
    regressions?: number
    neutral?: number
  }
  segments: {
    kept: KeptSegmentDiff[]
    moved: MovedSegmentDiff[]
    merged: MergedSegmentDiff[]
    dropped: DroppedSegmentDiff[]
    added: AddedSegmentDiff[]
  }
  junctions: {
    kept: JunctionKeptDiff[]
    shifted: JunctionShiftedDiff[]
    dropped: JunctionDroppedDiff[]
    added: JunctionAddedDiff[]
  }
  effects?: {
    summary: {
      improvements: number
      regressions: number
      neutral: number
    }
    improvements: TransitionEffect[]
    regressions: TransitionEffect[]
  }
}

export interface LayerDebugReport {
  version: typeof LAYER_DEBUG_VERSION
  drawing: string | null
  exportedAt: string
  planSize?: { width: number; height: number }
  pipelineSummary?: WallVariantExport['summary']
  layerCounts: Partial<Record<LayerId, LayerCounts>>
  layers: Partial<Record<LayerId, FlatLayer>>
  transitions: LayerTransitionDiff[]
}

export interface CompareLayerTransitionOptions {
  tolerancePx?: number
  movedThresholdPx?: number
  junctionSnapPx?: number
  junctionShiftThresholdPx?: number
  mergeBandPx?: number
  spurMinLengthPx?: number
}
