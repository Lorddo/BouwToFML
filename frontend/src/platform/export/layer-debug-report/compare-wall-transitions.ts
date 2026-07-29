import type { PipelineV3Debug } from '@/core/extraction/types'
import { compareLayerTransition } from '@/platform/export/layer-debug/compare-layer-transition'
import type { FlatLayer } from '@/platform/export/layer-debug/types'
import type { LayerDebugWallTransition } from './types'

const WALL_LAYER_ORDER = [
  'layer1',
  'layer2',
  'layer3',
  'layer4',
  'layer5',
  'layer6',
  'layer7',
  'layer8',
  'layer9',
  'layer10',
] as const

type WallLayerKey = (typeof WALL_LAYER_ORDER)[number]

function toFlatLayer(layer: NonNullable<PipelineV3Debug['layers'][WallLayerKey]>): FlatLayer {
  return {
    segments: layer.segments.map((seg) => ({
      a: { x: seg.a.x, y: seg.a.y },
      b: { x: seg.b.x, y: seg.b.y },
      lengthPx: Math.round(Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)),
    })),
    junctions: layer.junctions.map((junction) => ({
      x: junction.x,
      y: junction.y,
      kind: junction.kind,
      angleDeg: junction.angleDeg,
    })),
  }
}

/**
 * Consecutive V3 wall-layer diffs (layer1→…→layer10), compact: summary + drops only.
 */
export function compareWallLayerTransitions(
  layers: PipelineV3Debug['layers'],
): LayerDebugWallTransition[] {
  const transitions: LayerDebugWallTransition[] = []
  for (let i = 0; i < WALL_LAYER_ORDER.length - 1; i += 1) {
    const from = WALL_LAYER_ORDER[i]
    const to = WALL_LAYER_ORDER[i + 1]
    const prevLayer = layers[from]
    const nextLayer = layers[to]
    if (!prevLayer || !nextLayer) continue
    if (prevLayer.segments.length === 0 && nextLayer.segments.length === 0) continue

    const diff = compareLayerTransition(from, to, toFlatLayer(prevLayer), toFlatLayer(nextLayer))
    transitions.push({
      from,
      to,
      summary: {
        prevSegmentCount: diff.summary.prevSegmentCount,
        nextSegmentCount: diff.summary.nextSegmentCount,
        kept: diff.summary.kept,
        moved: diff.summary.moved,
        merged: diff.summary.merged,
        dropped: diff.summary.dropped,
        added: diff.summary.added,
        junctionDropped: diff.summary.junctionDropped,
        junctionAdded: diff.summary.junctionAdded,
        junctionShifted: diff.summary.junctionShifted,
      },
      droppedSegments: diff.segments.dropped.map((item) => ({
        prevIndex: item.prevIndex,
        a: item.prev.a,
        b: item.prev.b,
        lengthPx: item.prev.lengthPx,
        mid: item.prev.mid,
        dropReasonHint: item.dropReasonHint,
      })),
      droppedJunctions: diff.junctions.dropped.map((item) => ({
        prevIndex: item.prevIndex,
        x: item.prev.x,
        y: item.prev.y,
        kind: item.prev.kind,
      })),
    })
  }
  return transitions
}
