/** Gaps L1 — Solid face-demote orchestrator. */

import { demoteFacesByWallMaskCoverage } from './engines/face-demote'
import { demoteOversizedFacesByRefCap } from './ref-face-size-cap'
import { resolveSolidFaceDemotePolicy } from './policies/solid'
import type { GapsLayer1Result, SolidFaceDemotePolicy } from './types'
import type { RoomRasterClass, RoomClassificationGroupBy } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'

export function runGapsLayer1FaceDemote(params: {
  labelsData: Int32Array
  wallMaskData: Uint8Array
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  priorClassification: Map<number, RoomRasterClass>
  policy?: SolidFaceDemotePolicy
  groupBy?: RoomClassificationGroupBy
  maxRefFaceAreaPx?: number | null
}): GapsLayer1Result {
  const policy = params.policy ?? resolveSolidFaceDemotePolicy()
  const result = demoteFacesByWallMaskCoverage({
    labelsData: params.labelsData,
    wallMaskData: params.wallMaskData,
    components: params.components,
    parentMap: params.parentMap,
    priorClassification: params.priorClassification,
    policy,
    groupBy: params.groupBy,
  })

  let oversizedDemotedCount = 0
  let refFaceAreaCapPx: number | null = null
  if (params.maxRefFaceAreaPx != null && params.maxRefFaceAreaPx > 0) {
    const cap = demoteOversizedFacesByRefCap({
      classificationByLabel: result.classificationByLabel,
      components: params.components,
      parentMap: params.parentMap,
      maxRefFaceAreaPx: params.maxRefFaceAreaPx,
    })
    oversizedDemotedCount = cap.oversizedDemotedCount
    refFaceAreaCapPx = cap.areaCapPx
  }

  return {
    layerId: 1,
    policyId: 'solid',
    classificationByLabel: result.classificationByLabel,
    demotedCount: result.demotedCount,
    keptCount: result.keptCount,
    threshold: result.threshold,
    oversizedDemotedCount,
    maxRefFaceAreaPx: params.maxRefFaceAreaPx ?? null,
    refFaceAreaCapPx,
  }
}
