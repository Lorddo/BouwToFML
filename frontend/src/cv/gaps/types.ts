/** Gaps pipeline — Solid L1 face-demote (muurvlakken → outside via gapsLayer). */

import type { RoomRasterClass, RoomClassificationGroupBy } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

export type GapPolicyId = 'solid'

export type GapLayerId = 1

/** Legacy wall-cut policy (engine blijft beschikbaar). */
export interface SolidWallCutPolicy {
  policyId: 'solid'
  layerId: 1
  wallInkMaxValue: number
}

/** Solid L1 — face demote op muurmask-dekking. */
export interface SolidFaceDemotePolicy {
  policyId: 'solid'
  layerId: 1
  /** Face-dekking op gapsLayer-zwart ≥ dit → outside. */
  wallCoverageThreshold: number
}

export interface GapsLayer1Result {
  layerId: 1
  policyId: 'solid'
  classificationByLabel: Map<number, RoomRasterClass>
  demotedCount: number
  keptCount: number
  threshold: number
  /** Vlakken > N× grootste opening-ref face → outside. */
  oversizedDemotedCount?: number
  maxRefFaceAreaPx?: number | null
  refFaceAreaCapPx?: number | null
}

export interface RunGapsPipelineParams {
  labelsData: Int32Array
  wallMaskData: Uint8Array
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  priorClassification: Map<number, RoomRasterClass>
  policyId?: GapPolicyId
  groupBy?: RoomClassificationGroupBy
  /** Grootste niet-buiten ref-face px uit deur/raam-refs (source-crop). */
  maxRefFaceAreaPx?: number | null
}
