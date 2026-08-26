import type { DoorSwingHypothesis } from '@/cv/doors'
import { collectThinDoorMaskFaceIdsFromHyps } from '@/cv/doors/door-thin-mask'
import { buildBaselineWallMaskWithoutDoors } from '@/cv/doors/door-thin-mask-wing-bridge'
import { traceSkeletonSegmentsFromBinaryMask } from '@/cv/port/wallSkeletonTrace'
import {
  effectiveClassification,
  ensureFaceBBoxIndex,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'

/**
 * D-63 thin→mask: alleen bij finalize (L0-muurmask + definitieve hyps/faces).
 * Niet tijdens de initiële Stage-2 pass — WASM-meetlint op 4k bevriest Chrome.
 */
export async function resolveThinDoorMaskKeepFaceIds(params: {
  cache: RoomRasterCache
  accepted: readonly DoorSwingHypothesis[]
  referenceWallThicknessPx: number | undefined
}): Promise<number[]> {
  const ref = Math.max(0, params.referenceWallThicknessPx ?? 0)
  if (!(ref > 0) || params.accepted.length <= 0) return []

  const classification = effectiveClassification(params.cache)
  const parentMap = new Map(params.cache.state.parentMap)
  const classificationByLabel = new Map(params.cache.state.classificationByLabel)
  const labelsData =
    params.cache.state.labelsData instanceof Int32Array
      ? params.cache.state.labelsData
      : new Int32Array(params.cache.state.labelsData)
  const faceBBox = ensureFaceBBoxIndex(params.cache)
  const rasterCtx = {
    labelsData,
    width: params.cache.state.width,
    height: params.cache.state.height,
    parentMap,
    components: faceBBox.ink,
    classificationByLabel,
    classificationGroupBy: params.cache.state.classificationGroupBy ?? 'component',
    referenceWallThicknessPx: ref,
  }
  const wingBridge = {
    labelsData: rasterCtx.labelsData,
    width: rasterCtx.width,
    height: rasterCtx.height,
    parentMap: rasterCtx.parentMap,
    classificationByLabel: rasterCtx.classificationByLabel,
    classificationGroupBy: rasterCtx.classificationGroupBy,
    referenceWallThicknessPx: ref,
  }

  let meetlintSegments: Awaited<ReturnType<typeof traceSkeletonSegmentsFromBinaryMask>>
  try {
    const baselineMask = buildBaselineWallMaskWithoutDoors(wingBridge)
    meetlintSegments = await traceSkeletonSegmentsFromBinaryMask({
      mask: baselineMask,
      width: wingBridge.width,
      height: wingBridge.height,
    })
  } catch {
    meetlintSegments = []
  }

  return collectThinDoorMaskFaceIdsFromHyps(params.accepted, ref, {
    classForFaceId: (faceId) => classification.get(faceId) ?? null,
    betweenWalls: rasterCtx,
    wingBridge,
    polylineKeep:
      meetlintSegments.length > 0
        ? {
            segments: meetlintSegments,
            labelsData: wingBridge.labelsData,
            width: wingBridge.width,
            height: wingBridge.height,
            parentMap: wingBridge.parentMap,
            referenceWallThicknessPx: ref,
          }
        : undefined,
  })
}
