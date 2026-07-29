import type { RoomWallMaskRle } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { ConnectedWallBlob } from '../room-wall-connected-blobs'
import { buildWallDistanceMap } from '../room-wall-segment-thickness'
import { runLayer1RawWasm } from './layer-1-raw-wasm'
import { runLayer2RawSegments } from './layer-2-raw-segments'
import { runLayer3Prune } from './layer-3-prune'
import { runLayer4PositionHv } from './layer-4-position-hv'
import { runLayer5Cleanup } from './layer-5-cleanup'
import { runLayer6JunctionRepair } from './layer-6-repair'
import { runLayer7Align } from './layer-7-align'
import { runLayer8Finalize } from './layer-8-finalize'
import { runLayer9Dissolve } from './layer-9-dissolve'
import { runLayer10Fml } from './layer-10-fml'
import { listIncompleteLayers, isV3FmlReady, V3_NATIVE_THROUGH_LAYER } from './native-layers'
import type { PipelineV3Layer1Result, PipelineV3Result } from './types'

/**
 * V3 orchestrator — progressive native layers only.
 * No V2 bridge for missing layers: hard-stop after V3_NATIVE_THROUGH_LAYER.
 */
export async function runPipelineV3(params: {
  cv: OpenCV
  blobs: ConnectedWallBlob[]
  /** Ignored when present — V3 always runs its own L1 copy. */
  layer1?: PipelineV3Layer1Result
  maskRle: RoomWallMaskRle
  referenceWallThicknessPx?: number
}): Promise<PipelineV3Result> {
  const incompleteLayers = listIncompleteLayers(V3_NATIVE_THROUGH_LAYER)
  const fmlReady = isV3FmlReady(V3_NATIVE_THROUGH_LAYER)

  // Mask is constant after finalize — build distance map once for L2/L4/L7–L10.
  const distanceMap =
    buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null

  const layer1 = await runLayer1RawWasm({
    cv: params.cv,
    blobs: params.blobs,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  const layer2 = runLayer2RawSegments({
    layer1,
    cv: params.cv,
    maskRle: params.maskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    distanceMap,
  })
  const layer3 = runLayer3Prune({
    layer2,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  const layer4 = runLayer4PositionHv({
    layer3,
    cv: params.cv,
    maskRle: params.maskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    distanceMap,
  })
  const layer5 = runLayer5Cleanup({
    layer4,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  const layer6 = runLayer6JunctionRepair({
    layer5,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  const layer7 = runLayer7Align({
    layer6,
    cv: params.cv,
    maskRle: params.maskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    distanceMap,
  })
  const layer8 = runLayer8Finalize({
    layer7,
    cv: params.cv,
    maskRle: params.maskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    distanceMap,
  })
  const layer9 = runLayer9Dissolve({
    layer8,
    cv: params.cv,
    maskRle: params.maskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    distanceMap,
  })
  const layer10 = runLayer10Fml({
    layer9,
    cv: params.cv,
    maskRle: params.maskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    distanceMap,
  })

  return {
    pipelineVersion: 'v3',
    completedThroughLayer: V3_NATIVE_THROUGH_LAYER,
    incompleteLayers,
    fmlReady,
    layer1,
    layer2,
    layer3,
    layer4,
    layer5,
    layer6,
    layer7,
    layer8,
    layer9,
    layer10,
    debug: {
      layer1: {
        segments: layer1.allSegmentsRaw,
        junctions: layer1.allJunctionsRaw,
      },
      layer2: {
        segments: layer2.allSegmentsClean,
        junctions: layer2.allJunctionsClean,
      },
      layer3: {
        segments: layer3.allSegmentsPruned,
        junctions: layer3.allJunctionsPruned,
      },
      layer4: {
        segments: layer4.allSegmentsPositioned,
        junctions: layer4.allJunctionsPositioned,
      },
      layer5: {
        segments: layer5.allSegmentsCleaned,
        junctions: layer5.allJunctionsCleaned,
      },
      layer6: {
        segments: layer6.allSegmentsRepaired,
        junctions: layer6.allJunctionsRepaired,
      },
      layer7: {
        segments: layer7.allSegmentsAligned,
        junctions: layer7.allJunctionsAligned,
      },
      layer8: {
        segments: layer8.allSegmentsFinalized,
        junctions: layer8.allJunctionsFinalized,
      },
      layer9: {
        segments: layer9.allSegmentsCollapsed,
        junctions: layer9.allJunctionsCollapsed,
      },
      layer10: {
        segments: layer10.allSegmentsReady,
        junctions: layer10.allJunctionsReady,
      },
      incompleteLayers,
    },
  }
}

export type { PipelineV3Result } from './types'
export type {
  PipelineV3Layer1Result,
  PipelineV3Layer2Result,
  PipelineV3Layer3Result,
  PipelineV3Layer4Result,
  PipelineV3Layer5Result,
  PipelineV3Layer6Result,
  PipelineV3Layer7Result,
  PipelineV3Layer8Result,
  PipelineV3Layer9Result,
  PipelineV3Layer10Result,
} from './types'
