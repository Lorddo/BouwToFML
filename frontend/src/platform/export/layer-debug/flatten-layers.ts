import type { RoomJunctionRecord } from '../examples-report.ts'
import type { FlatLayer, LayerCounts, LayerId } from './types.ts'

function countJunctionKinds(
  junctions: RoomJunctionRecord[],
): Record<RoomJunctionRecord['kind'], number> {
  const counts: Record<RoomJunctionRecord['kind'], number> = { I: 0, L: 0, T: 0, X: 0 }
  for (const junction of junctions) counts[junction.kind] += 1
  return counts
}

function layerCountsFromFlat(layer: FlatLayer): LayerCounts {
  return {
    faceCount: layer.faceCount,
    segmentCount: layer.segments.length,
    junctionCount: layer.junctions.length,
    junctionKinds: countJunctionKinds(layer.junctions),
  }
}

export function layerCountsFromLayers(
  layers: Partial<Record<LayerId, FlatLayer>>,
): Partial<Record<LayerId, LayerCounts>> {
  const counts: Partial<Record<LayerId, LayerCounts>> = {}
  for (const id of ['A', 'B', 'C', 'D', 'E'] as const) {
    const layer = layers[id]
    if (layer) counts[id] = layerCountsFromFlat(layer)
  }
  return counts
}
