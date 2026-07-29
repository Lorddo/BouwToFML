/** V3 Laag 4 — bare H/V position (Copy6/7). Geen seal; junctions + mapped endpoints co-move. */
import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { reportPipelineProgress } from '@/cv/pipeline/pipeline-progress'
import { buildWallDistanceMap } from '@/cv/walls/rooms/room-wall-segment-thickness'
import type { Segment } from '@/cv/port/wallGraph'
import type { RoomWallFaceSkeleton, RoomWallJunction } from '../room-wall-skeleton-types'
import { assertLayer4Invariants, positionSegmentsHv } from './engines/hv'
import { resolveLayer4HvPolicy } from './policies/layer-4'
import type { PipelineV3Layer3Result, PipelineV3Layer4Result } from './types'

export function runLayer4PositionHv(params: {
  layer3: PipelineV3Layer3Result
  cv?: OpenCV
  maskRle?: RoomWallMaskRle
  referenceWallThicknessPx?: number
  /** Injected wall distance map (same maskRle); built once if omitted. */
  distanceMap?: Float32Array | null
}): PipelineV3Layer4Result {
  reportPipelineProgress('Skeleton Laag 4…')
  const policy = resolveLayer4HvPolicy(params.referenceWallThicknessPx)
  const distanceMap =
    params.distanceMap !== undefined
      ? params.distanceMap
      : params.cv && params.maskRle
        ? (buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null)
        : null
  const width = params.maskRle?.width ?? 0
  const height = params.maskRle?.height ?? 0

  const facesPositioned: RoomWallFaceSkeleton[] = []
  const allSegmentsPositioned: Segment[] = []
  const allJunctionsPositioned: RoomWallJunction[] = []
  let movedSegmentCount = 0
  let movedJunctionCount = 0

  for (const face of params.layer3.facesPruned) {
    const positioned = positionSegmentsHv({
      face,
      distanceMap,
      maskWidth: width,
      maskHeight: height,
      policy,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
    facesPositioned.push(positioned.face)
    allSegmentsPositioned.push(...positioned.face.segments)
    allJunctionsPositioned.push(...positioned.face.junctions)
    movedSegmentCount += positioned.movedSegmentCount
    movedJunctionCount += positioned.movedJunctionCount
  }

  const baseResult = {
    facesPositioned,
    allSegmentsPositioned,
    allJunctionsPositioned,
    totalSegmentsPositioned: allSegmentsPositioned.length,
    totalJunctionsPositioned: allJunctionsPositioned.length,
    positionStats: {
      movedSegmentCount,
      movedJunctionCount,
    },
  }
  const invariantReport = assertLayer4Invariants({
    layer3: params.layer3,
    layer4: baseResult,
  })
  return {
    ...baseResult,
    invariantReport,
  }
}
