import type { ExtractionOutput, PipelineLayerDebug, PipelineV3Debug } from '@/core/extraction/types'
import type { RoomJunctionRecord, SegmentRecord } from '@/platform/export/examples-report'

export interface FlatProbeLayer {
  segments: SegmentRecord[]
  junctions: RoomJunctionRecord[]
}

/** Pipeline lagen 1–9 (probe; L10 via layer-debug-report). */
export type ProbeLayerKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

export interface FlattenedProbeLayers {
  pipelineVersion: 'v3'
  layerOrder: ProbeLayerKey[]
  layers: Partial<Record<ProbeLayerKey, FlatProbeLayer>>
}

function segmentRecordFromCandidate(seg: {
  a: { x: number; y: number }
  b: { x: number; y: number }
}): SegmentRecord {
  return {
    a: { x: seg.a.x, y: seg.a.y },
    b: { x: seg.b.x, y: seg.b.y },
    lengthPx: Math.round(Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)),
  }
}

function flattenLayer(debug: PipelineLayerDebug | undefined): FlatProbeLayer {
  if (!debug) return { segments: [], junctions: [] }
  return {
    segments: debug.segments.map(segmentRecordFromCandidate),
    junctions: debug.junctions.map((junction) => ({
      x: junction.x,
      y: junction.y,
      kind: junction.kind,
      angleDeg: junction.angleDeg,
    })),
  }
}

function flattenFromPipelineDebug(debug: PipelineV3Debug): FlattenedProbeLayers {
  const layers: Partial<Record<ProbeLayerKey, FlatProbeLayer>> = {}
  const layerOrder: ProbeLayerKey[] = []
  const keys: Array<{ n: ProbeLayerKey; layer: PipelineLayerDebug | undefined }> = [
    { n: '1', layer: debug.layers.layer1 },
    { n: '2', layer: debug.layers.layer2 },
    { n: '3', layer: debug.layers.layer3 },
    { n: '4', layer: debug.layers.layer4 },
    { n: '5', layer: debug.layers.layer5 },
    { n: '6', layer: debug.layers.layer6 },
    { n: '7', layer: debug.layers.layer7 },
    { n: '8', layer: debug.layers.layer8 },
    { n: '9', layer: debug.layers.layer9 },
  ]
  for (const { n, layer } of keys) {
    if (!layer) continue
    layers[n] = flattenLayer(layer)
    if (layers[n].segments.length > 0 || layers[n].junctions.length > 0) {
      layerOrder.push(n)
    }
  }
  return { pipelineVersion: 'v3', layers, layerOrder }
}

/** Zelfde bron als layer-debug export: pipelineV3Debug lagen 1–9. */
export function flattenLayersFromOutput(
  output: ExtractionOutput | null | undefined,
): FlattenedProbeLayers {
  const debug = output?.pipelineV3Debug
  if (!debug) {
    return { pipelineVersion: 'v3', layers: {}, layerOrder: [] }
  }
  return flattenFromPipelineDebug(debug)
}

export function formatProbeLayerLabel(layerKey: ProbeLayerKey): string {
  return `Laag ${layerKey}`
}

export function probeLayerJsonPath(layerKey: ProbeLayerKey): string | null {
  if (layerKey === '1') return 'layers.layer1.segments'
  if (layerKey === '2') return 'layers.layer2.segments'
  if (layerKey === '3') return 'layers.layer3.segments'
  if (layerKey === '4') return 'layers.layer4.segments'
  if (layerKey === '5') return 'layers.layer5.segments'
  if (layerKey === '6') return 'layers.layer6.segments'
  if (layerKey === '7') return 'layers.layer7.segments'
  if (layerKey === '8') return 'layers.layer8.segments'
  if (layerKey === '9') return 'layers.layer9.segments'
  return null
}
