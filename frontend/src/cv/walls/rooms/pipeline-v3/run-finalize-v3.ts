import { encodeMaskRle } from '@/cv/util/binary-mask-rle'
import { releaseConnectedWallBlobs } from '../room-wall-connected-blobs'
import { asSegmentCandidates } from '../../strategy-utils'
import { runPipelineV3 } from './index'
import type { RoomFinalizeSharedPrepResult } from '../room-wall-finalize-shared'
import type { PipelineLayer1FaceDebug, PipelineV3Debug } from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import type {
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
  PipelineV3Result,
} from './types'
import type { RoomWallJunction } from '../room-wall-skeleton-types'

export interface FinalizeV3Result {
  pipeline: PipelineV3Result
  layer1: PipelineV3Layer1Result
  layer2: PipelineV3Layer2Result
  layer3?: PipelineV3Layer3Result
  layer4?: PipelineV3Layer4Result
  layer5?: PipelineV3Layer5Result
  layer6?: PipelineV3Layer6Result
  layer7?: PipelineV3Layer7Result
  layer8?: PipelineV3Layer8Result
  layer9?: PipelineV3Layer9Result
  layer10?: PipelineV3Layer10Result
  completedThroughLayer: number
  incompleteLayers: number[]
  fmlReady: boolean
  roomWallMaskRle: ReturnType<typeof encodeMaskRle>
  pipelineV3Debug: PipelineV3Debug
  blobCount: number
  removedBlobCount: number
}

function countJunctionKinds(
  junctions: Array<{ kind: 'I' | 'L' | 'T' | 'X' }>,
): Record<'I' | 'L' | 'T' | 'X', number> {
  const counts: Record<'I' | 'L' | 'T' | 'X', number> = { I: 0, L: 0, T: 0, X: 0 }
  for (const junction of junctions) {
    counts[junction.kind] += 1
  }
  return counts
}

function mapJunctions(junctions: RoomWallJunction[]) {
  return junctions.map((junction) => ({
    x: junction.x,
    y: junction.y,
    kind: junction.kind,
    angleDeg: junction.angleDeg,
  }))
}

/** Index-ranges into the flat L1 segment/junction lists (contiguous per face). */
export function buildLayer1FaceDebugEntries(
  layer1: PipelineV3Layer1Result,
): PipelineLayer1FaceDebug[] {
  const faces: PipelineLayer1FaceDebug[] = []
  let segmentOffset = 0
  let junctionOffset = 0
  for (const face of layer1.facesRaw) {
    const segmentStart = segmentOffset
    const segmentEnd = segmentOffset + face.segments.length
    const junctionStart = junctionOffset
    const junctionEnd = junctionOffset + face.junctions.length
    faces.push({
      rootLabel: face.rootLabel,
      bbox: { ...face.bbox },
      areaPx: face.areaPx,
      inkCoverageRatio: face.inkCoverageRatio,
      segmentStart,
      segmentEnd,
      junctionStart,
      junctionEnd,
    })
    segmentOffset = segmentEnd
    junctionOffset = junctionEnd
  }
  return faces
}

/**
 * Rebuild `PipelineV3Layer1Result` from the flat layer-1 debug lists + face ranges.
 * Used by the E2E fixture harness when injecting a baked skeleton into `runPipelineV3`.
 */
export function rebuildLayer1FromFaceDebug(params: {
  faces: PipelineLayer1FaceDebug[]
  segments: Array<{
    a: { x: number; y: number }
    b: { x: number; y: number }
    templateIndex?: number
  }>
  junctions: Array<{ x: number; y: number; kind: 'I' | 'L' | 'T' | 'X'; angleDeg: number }>
}): PipelineV3Layer1Result {
  const allSegmentsRaw = params.segments.map((seg) => ({
    a: { ...seg.a },
    b: { ...seg.b },
    ...(seg.templateIndex !== undefined ? { templateIndex: seg.templateIndex } : {}),
  }))
  const facesRaw = params.faces.map((face) => {
    const segments = allSegmentsRaw.slice(face.segmentStart, face.segmentEnd)
    const junctions = params.junctions.slice(face.junctionStart, face.junctionEnd).map((j) => ({
      rootLabel: face.rootLabel,
      x: j.x,
      y: j.y,
      kind: j.kind,
      angleDeg: j.angleDeg,
    }))
    return {
      rootLabel: face.rootLabel,
      bbox: { ...face.bbox },
      areaPx: face.areaPx,
      inkCoverageRatio: face.inkCoverageRatio,
      segments,
      junctions,
      stats: {
        segmentCount: segments.length,
        junctionCount: junctions.length,
        elapsedMs: 0,
      },
    }
  })
  const allJunctionsRaw = facesRaw.flatMap((face) => face.junctions)
  return {
    facesRaw,
    allSegmentsRaw,
    allJunctionsRaw,
    totalSegmentsRaw: allSegmentsRaw.length,
    totalJunctionsRaw: allJunctionsRaw.length,
  }
}

export async function runFinalizePipelineV3(params: {
  cv: OpenCV
  prep: RoomFinalizeSharedPrepResult
  referenceWallThicknessPx?: number
  bandBoundariesPx?: { midBoundaryPx: number; maxBoundaryPx: number }
}): Promise<FinalizeV3Result> {
  const roomWallMaskRle = encodeMaskRle(
    params.prep.splitBlobs.keptWallMaskData,
    params.prep.width,
    params.prep.height,
  )
  const pipeline = await runPipelineV3({
    cv: params.cv,
    blobs: params.prep.splitBlobs.blobs,
    maskRle: roomWallMaskRle,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
    bandBoundariesPx: params.bandBoundariesPx,
  })

  const { layer1, layer2, layer3, layer4, layer5, layer6, layer7, layer8, layer9, layer10 } =
    pipeline
  const segmentCounts: Record<string, number> = {
    layer1: layer1.totalSegmentsRaw,
    layer2: layer2.totalSegmentsClean,
  }
  const junctionCounts: Record<string, number> = {
    layer1: layer1.totalJunctionsRaw,
    layer2: layer2.totalJunctionsClean,
  }
  const junctionKindCounts: Record<string, Record<'I' | 'L' | 'T' | 'X', number>> = {
    layer1: countJunctionKinds(layer1.allJunctionsRaw),
    layer2: countJunctionKinds(layer2.allJunctionsClean),
  }

  const layers: PipelineV3Debug['layers'] = {
    layer1: {
      segments: asSegmentCandidates(layer1.allSegmentsRaw),
      junctions: mapJunctions(layer1.allJunctionsRaw),
      faces: buildLayer1FaceDebugEntries(layer1),
    },
    layer2: {
      segments: asSegmentCandidates(layer2.allSegmentsClean),
      junctions: mapJunctions(layer2.allJunctionsClean),
    },
  }

  if (layer3) {
    segmentCounts.layer3 = layer3.totalSegmentsPruned
    junctionCounts.layer3 = layer3.totalJunctionsPruned
    junctionKindCounts.layer3 = countJunctionKinds(layer3.allJunctionsPruned)
    layers.layer3 = {
      segments: asSegmentCandidates(layer3.allSegmentsPruned),
      junctions: mapJunctions(layer3.allJunctionsPruned),
    }
  }

  if (layer4) {
    segmentCounts.layer4 = layer4.totalSegmentsPositioned
    junctionCounts.layer4 = layer4.totalJunctionsPositioned
    junctionKindCounts.layer4 = countJunctionKinds(layer4.allJunctionsPositioned)
    layers.layer4 = {
      segments: asSegmentCandidates(layer4.allSegmentsPositioned),
      junctions: mapJunctions(layer4.allJunctionsPositioned),
    }
  }

  if (layer5) {
    segmentCounts.layer5 = layer5.totalSegmentsCleaned
    junctionCounts.layer5 = layer5.totalJunctionsCleaned
    junctionKindCounts.layer5 = countJunctionKinds(layer5.allJunctionsCleaned)
    layers.layer5 = {
      segments: asSegmentCandidates(layer5.allSegmentsCleaned),
      junctions: mapJunctions(layer5.allJunctionsCleaned),
    }
  }

  if (layer6) {
    segmentCounts.layer6 = layer6.totalSegmentsRepaired
    junctionCounts.layer6 = layer6.totalJunctionsRepaired
    junctionKindCounts.layer6 = countJunctionKinds(layer6.allJunctionsRepaired)
    layers.layer6 = {
      segments: asSegmentCandidates(layer6.allSegmentsRepaired),
      junctions: mapJunctions(layer6.allJunctionsRepaired),
    }
  }

  if (layer7) {
    segmentCounts.layer7 = layer7.totalSegmentsAligned
    junctionCounts.layer7 = layer7.totalJunctionsAligned
    junctionKindCounts.layer7 = countJunctionKinds(layer7.allJunctionsAligned)
    layers.layer7 = {
      segments: asSegmentCandidates(layer7.allSegmentsAligned),
      junctions: mapJunctions(layer7.allJunctionsAligned),
    }
  }

  if (layer8) {
    segmentCounts.layer8 = layer8.totalSegmentsFinalized
    junctionCounts.layer8 = layer8.totalJunctionsFinalized
    junctionKindCounts.layer8 = countJunctionKinds(layer8.allJunctionsFinalized)
    layers.layer8 = {
      segments: asSegmentCandidates(layer8.allSegmentsFinalized),
      junctions: mapJunctions(layer8.allJunctionsFinalized),
    }
  }

  if (layer9) {
    segmentCounts.layer9 = layer9.totalSegmentsCollapsed
    junctionCounts.layer9 = layer9.totalJunctionsCollapsed
    junctionKindCounts.layer9 = countJunctionKinds(layer9.allJunctionsCollapsed)
    layers.layer9 = {
      segments: asSegmentCandidates(layer9.allSegmentsCollapsed),
      junctions: mapJunctions(layer9.allJunctionsCollapsed),
    }
  }

  if (layer10) {
    segmentCounts.layer10 = layer10.totalSegmentsReady
    junctionCounts.layer10 = layer10.totalJunctionsReady
    junctionKindCounts.layer10 = countJunctionKinds(layer10.allJunctionsReady)
    layers.layer10 = {
      segments: asSegmentCandidates(layer10.allSegmentsReady),
      junctions: mapJunctions(layer10.allJunctionsReady),
    }
  }

  const pipelineV3Debug: PipelineV3Debug = {
    pipelineVersion: 'v3',
    layers,
    summary: {
      segmentCounts,
      junctionCounts,
      junctionKindCounts,
      incompleteLayers: pipeline.incompleteLayers,
      bridgeMode: 'native',
      completedThroughLayer: pipeline.completedThroughLayer,
      fmlReady: pipeline.fmlReady,
    },
  }

  params.prep.splitBlobs.filteredMask.delete()
  releaseConnectedWallBlobs(params.prep.splitBlobs.blobs)

  return {
    pipeline,
    layer1,
    layer2,
    layer3: layer3 ?? undefined,
    layer4: layer4 ?? undefined,
    layer5: layer5 ?? undefined,
    layer6: layer6 ?? undefined,
    layer7: layer7 ?? undefined,
    layer8: layer8 ?? undefined,
    layer9: layer9 ?? undefined,
    layer10: layer10 ?? undefined,
    completedThroughLayer: pipeline.completedThroughLayer,
    incompleteLayers: pipeline.incompleteLayers,
    fmlReady: pipeline.fmlReady,
    roomWallMaskRle,
    pipelineV3Debug,
    blobCount: params.prep.splitBlobs.blobs.length,
    removedBlobCount: params.prep.splitBlobs.removedBlobCount,
  }
}
