import type { PipelineV3Debug } from '@/core/extraction/types'
import type { BoundDoor, DoorResolvedKind, OrientedDoor, ResolvedDoorCandidate } from '@/cv/doors'
import type {
  BoundWindow,
  ResolvedWindowCandidate,
  WindowBindRejectReason,
  WindowBindRejection,
} from '@/cv/windows'

export const LAYER_DEBUG_REPORT_VERSION = 1 as const

/** L11: deur gekoppeld aan L10-segment (na wall-snap). */
export interface LayerDebugDoorBound {
  doorId: string
  segmentIndex: number
  junctionAId?: string
  junctionBId?: string
  t: number
  openingAxis: BoundDoor['openingAxis']
  outwardSign: BoundDoor['outwardSign']
  contactScore: number
  secondaryContactScore: number
  snappedBBox: BoundDoor['snappedBBox']
}

/** L11: resolved deur zonder segment-match. */
export interface LayerDebugDoorUnbound {
  doorId: string
  reason: 'no_segment_match'
  kind: DoorResolvedKind
  matchedRefIndex: number
  bbox: ResolvedDoorCandidate['bbox']
  /** Hinge volgt pas in L12 — unbound toont centroid. */
  centroidPx: ResolvedDoorCandidate['centroidPx']
  fmlRefId: string
}

export interface LayerDebugLayer11 {
  bound: LayerDebugDoorBound[]
  unbound: LayerDebugDoorUnbound[]
}

/** L12: georiënteerde deur (compact — zonder overlay-polylines). */
export interface LayerDebugDoorOriented {
  doorId: string
  segmentIndex: number
  junctionAId?: string
  junctionBId?: string
  t: number
  openingAxis: OrientedDoor['openingAxis']
  outwardSign: OrientedDoor['outwardSign']
  kind: DoorResolvedKind
  fmlRefId: string
  mirrored: OrientedDoor['mirrored']
  snappedBBox: OrientedDoor['snappedBBox']
  hingePx: OrientedDoor['hingePx']
  openingStartPx: OrientedDoor['openingStartPx']
  openingEndPx: OrientedDoor['openingEndPx']
  displayStartPx: OrientedDoor['displayStartPx']
  displayEndPx: OrientedDoor['displayEndPx']
  framingAlongPx: number
  framingOppositePx: number
}

export interface LayerDebugDoorOrientSkipped {
  doorId: string
  reason: 'orient_failed'
  segmentIndex: number
}

export interface LayerDebugLayer12 {
  oriented: LayerDebugDoorOriented[]
  skipped: LayerDebugDoorOrientSkipped[]
}

/** L14: gebonden raam. */
export type LayerDebugWindowBound = BoundWindow

export interface LayerDebugWindowRejected {
  windowId: string
  reason: WindowBindRejectReason
  evidence: ResolvedWindowCandidate['evidence']
  matchedRefIndex: number
  bbox: ResolvedWindowCandidate['bbox']
  widthPx: number
  faceIds: number[]
}

export interface LayerDebugLayer14 {
  bound: LayerDebugWindowBound[]
  rejected: LayerDebugWindowRejected[]
}

/**
 * Openingen buiten V3 L1–L10.
 * L13 bestaat niet (gereserveerd / overgeslagen in UI).
 */
export interface LayerDebugOpenings {
  layer11?: LayerDebugLayer11
  layer12?: LayerDebugLayer12
  layer14?: LayerDebugLayer14
}

export interface LayerDebugOpeningsSummary {
  layer11?: { bound: number; unbound: number }
  layer12?: { oriented: number; skipped: number }
  layer14?: {
    bound: number
    rejected: number
    rejectedByReason: Partial<Record<WindowBindRejectReason, number>>
  }
}

/** Compact L_n → L_{n+1} wall-layer drop info (kept/moved geometry blijft in `layers`). */
export interface LayerDebugWallTransition {
  from: string
  to: string
  summary: {
    prevSegmentCount: number
    nextSegmentCount: number
    kept: number
    moved: number
    merged: number
    dropped: number
    added: number
    junctionDropped: number
    junctionAdded: number
    junctionShifted: number
  }
  droppedSegments: Array<{
    prevIndex: number
    a: { x: number; y: number }
    b: { x: number; y: number }
    lengthPx: number
    mid: { x: number; y: number }
    dropReasonHint: string
  }>
  droppedJunctions: Array<{
    prevIndex: number
    x: number
    y: number
    kind: string
  }>
}

export interface LayerDebugReport {
  version: typeof LAYER_DEBUG_REPORT_VERSION
  drawing: string | null
  exportedAt: string
  pipelineVersion: 'v3'
  roomPipelinePhase?: string
  layers: PipelineV3Debug['layers']
  summary?: PipelineV3Debug['summary']
  /** Consecutive wall-layer diffs with dropped segments/junctions. */
  wallTransitions?: LayerDebugWallTransition[]
  /** Deuren L11/L12 + ramen L14 (niet in pipelineV3Debug). */
  openings?: LayerDebugOpenings
  openingsSummary?: LayerDebugOpeningsSummary
}

export type LayerDebugOpeningsInput = {
  resolvedDoors?: ResolvedDoorCandidate[]
  boundDoors?: BoundDoor[]
  orientedDoors?: OrientedDoor[]
  boundWindows?: BoundWindow[]
  windowBindRejections?: WindowBindRejection[]
}
