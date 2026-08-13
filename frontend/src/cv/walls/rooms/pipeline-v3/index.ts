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
import { collectObliqueAxes } from './engines/oblique'
import { listIncompleteLayers, isV3FmlReady, V3_NATIVE_THROUGH_LAYER } from './native-layers'
import { resolveObliquePolicy } from './policies/oblique'
import type { PipelineV3Layer1Result, PipelineV3Result } from './types'

function requireBlobsForLayer1(blobs: ConnectedWallBlob[] | undefined): ConnectedWallBlob[] {
  if (!blobs) {
    throw new Error('runPipelineV3: blobs is required when layer1 is not provided')
  }
  return blobs
}

/**
 * V3 orchestrator — progressive native layers only.
 * No V2 bridge for missing layers: hard-stop after V3_NATIVE_THROUGH_LAYER.
 *
 * When `layer1` is provided (E2E harness / baked skeleton), L1 is skipped and
 * `blobs` may be omitted. Production finalize always supplies blobs and no layer1.
 */
export async function runPipelineV3(params: {
  cv: OpenCV
  blobs?: ConnectedWallBlob[]
  /** When present, used as-is; L1 (WASM skeleton) is not re-run. */
  layer1?: PipelineV3Layer1Result
  maskRle: RoomWallMaskRle
  referenceWallThicknessPx?: number
  /** Absolute meetbandgrenzen uit multi muur-ref (L7/L9/L10 classify). */
  bandBoundariesPx?: { midBoundaryPx: number; maxBoundaryPx: number }
}): Promise<PipelineV3Result> {
  const incompleteLayers = listIncompleteLayers(V3_NATIVE_THROUGH_LAYER)
  const fmlReady = isV3FmlReady(V3_NATIVE_THROUGH_LAYER)

  // Mask is constant after finalize — build distance map once for L2/L4/L7–L10.
  const distanceMap =
    buildWallDistanceMap({ cv: params.cv, maskRle: params.maskRle })?.distanceMap ?? null

  const layer1 =
    params.layer1 ??
    (await runLayer1RawWasm({
      cv: params.cv,
      blobs: requireBlobsForLayer1(params.blobs),
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    }))
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
  // Laag 3 is het laatste punt waar een schuine gevel nog op zijn hartlijn ligt:
  // laag 4 trekt hem naar H/V. Hier alleen lezen; herstellen doet laag 10.
  const obliquePolicy = resolveObliquePolicy(params.referenceWallThicknessPx)
  const obliqueAxes = distanceMap
    ? collectObliqueAxes({
        segments: layer3.allSegmentsPruned,
        policy: obliquePolicy,
        field: {
          distanceMap,
          width: params.maskRle.width,
          height: params.maskRle.height,
          maxSearchPx: obliquePolicy.ridgeMaxSearchPx,
          sampleStepPx: obliquePolicy.ridgeSampleStepPx,
        },
      })
    : []

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
    bandBoundariesPx: params.bandBoundariesPx,
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
    bandBoundariesPx: params.bandBoundariesPx,
    distanceMap,
  })
  const layer10 = runLayer10Fml({
    layer9,
    cv: params.cv,
    maskRle: params.maskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    bandBoundariesPx: params.bandBoundariesPx,
    distanceMap,
    obliqueAxes,
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
