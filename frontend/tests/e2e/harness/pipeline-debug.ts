import type { ExtractionOutput, PipelineV3Debug } from '@/core/extraction'
import type { PipelineV3Result } from '@/cv/walls/rooms/pipeline-v3/types'
import { asSegmentCandidates } from '@/cv/walls/strategy-utils'
import { buildLayer1FaceDebugEntries } from '@/cv/walls/rooms/pipeline-v3/run-finalize-v3'
import type { RoomWallJunction } from '@/cv/walls/rooms/room-wall-skeleton-types'

function countJunctionKinds(
  junctions: Array<{ kind: 'I' | 'L' | 'T' | 'X' }>,
): Record<'I' | 'L' | 'T' | 'X', number> {
  const counts: Record<'I' | 'L' | 'T' | 'X', number> = { I: 0, L: 0, T: 0, X: 0 }
  for (const junction of junctions) counts[junction.kind] += 1
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

/** Spiegel van finalize-debugbouw — harness-only, productie ongemoeid. */
export function pipelineResultToDebug(pipeline: PipelineV3Result): PipelineV3Debug {
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

  const push = (
    key: keyof PipelineV3Debug['layers'],
    segs: Parameters<typeof asSegmentCandidates>[0],
    juncs: RoomWallJunction[],
    segCount: number,
    juncCount: number,
  ) => {
    segmentCounts[key] = segCount
    junctionCounts[key] = juncCount
    junctionKindCounts[key] = countJunctionKinds(juncs)
    layers[key] = {
      segments: asSegmentCandidates(segs),
      junctions: mapJunctions(juncs),
    }
  }

  if (layer3) {
    push(
      'layer3',
      layer3.allSegmentsPruned,
      layer3.allJunctionsPruned,
      layer3.totalSegmentsPruned,
      layer3.totalJunctionsPruned,
    )
  }
  if (layer4) {
    push(
      'layer4',
      layer4.allSegmentsPositioned,
      layer4.allJunctionsPositioned,
      layer4.totalSegmentsPositioned,
      layer4.totalJunctionsPositioned,
    )
  }
  if (layer5) {
    push(
      'layer5',
      layer5.allSegmentsCleaned,
      layer5.allJunctionsCleaned,
      layer5.totalSegmentsCleaned,
      layer5.totalJunctionsCleaned,
    )
  }
  if (layer6) {
    push(
      'layer6',
      layer6.allSegmentsRepaired,
      layer6.allJunctionsRepaired,
      layer6.totalSegmentsRepaired,
      layer6.totalJunctionsRepaired,
    )
  }
  if (layer7) {
    push(
      'layer7',
      layer7.allSegmentsAligned,
      layer7.allJunctionsAligned,
      layer7.totalSegmentsAligned,
      layer7.totalJunctionsAligned,
    )
  }
  if (layer8) {
    push(
      'layer8',
      layer8.allSegmentsFinalized,
      layer8.allJunctionsFinalized,
      layer8.totalSegmentsFinalized,
      layer8.totalJunctionsFinalized,
    )
  }
  if (layer9) {
    push(
      'layer9',
      layer9.allSegmentsCollapsed,
      layer9.allJunctionsCollapsed,
      layer9.totalSegmentsCollapsed,
      layer9.totalJunctionsCollapsed,
    )
  }
  if (layer10) {
    push(
      'layer10',
      layer10.allSegmentsReady,
      layer10.allJunctionsReady,
      layer10.totalSegmentsReady,
      layer10.totalJunctionsReady,
    )
  }

  return {
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
}

export function extractionFromPipeline(params: {
  pipeline: PipelineV3Result
  maskRle: ExtractionOutput['roomWallMaskRle']
}): ExtractionOutput {
  return {
    pipelineV3Debug: pipelineResultToDebug(params.pipeline),
    roomWallMaskRle: params.maskRle,
    meta: { extractorId: 'e2e-fixture', elapsedMs: 0 },
  }
}

export { countJunctionKinds }
