import type {
  WeldPolicy,
  TopologyPolicy,
  JunctionGraphPolicy,
  Layer5CleanupPolicy,
} from '../engines/policy-types'
import { PIPELINE_ENDPOINT_EPS_PX, resolvePipelineScale } from '../engines/scale'

/**
 * L5 — Copy(6) cleanup + dangling/near weld.
 * No seal-after-removal, no I-junction rollback, never L6 weld.
 */

const LAYER5_MAX_ITERATIONS = 20

const SCALE_REF30 = resolvePipelineScale()

export const layer5WeldPolicy: WeldPolicy = {
  layerId: 5,
  /** Copy6 LAYER5_WELD_MAX_GAP_PX */
  nearEndpointGapPx: 0.8,
  endpointEpsPx: PIPELINE_ENDPOINT_EPS_PX,
  /** Copy6 LAYER5_REPAIR_MAX_GAP_PX was 2.5; raise to 4 so a ~3.3px T-stub
   * gap can still close if a prior step removed the stub without reconnect. */
  repairMaxGapPx: SCALE_REF30.layer5RepairMaxGapPx,
}

/** Copy6 loop: enforceINodeCheck always false. */
export const layer5TopologyPolicy: TopologyPolicy = {
  layerId: 5,
  enforceINodeCheck: false,
  endpointEpsPx: PIPELINE_ENDPOINT_EPS_PX,
  junctionSnapPx: 0,
  weldBeforeGraph: true,
}

const layer5JunctionPolicy: JunctionGraphPolicy = {
  layerId: 5,
  snapPx: 0,
  weldBeforeGraph: true,
}

/** Copy6 resolveLayer5MicroMaxPx */
function resolveLayer5MicroMaxPx(referenceWallThicknessPx?: number): number {
  const ref = resolvePipelineScale(referenceWallThicknessPx).refPx
  const scaled = Math.round(ref * 0.15)
  return Math.max(2, Math.min(10, scaled))
}

/** Copy6 resolveLayer5TxZoneMaxPx */
function resolveLayer5TxZoneMaxPx(referenceWallThicknessPx?: number): number {
  const ref = resolvePipelineScale(referenceWallThicknessPx).refPx
  const scaled = Math.round(ref * 0.28)
  return Math.max(5, Math.min(20, scaled))
}

export function resolveLayer5CleanupPolicy(referenceWallThicknessPx?: number): Layer5CleanupPolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  const thicknessFallbackPx = scale.thicknessFallbackRefPx
  return {
    layerId: 5,
    maxIterations: LAYER5_MAX_ITERATIONS,
    sameLineMaxOffsetPx: scale.layer5SameLineMaxOffsetPx,
    thicknessFallbackPx,
    txZoneMaxPx: resolveLayer5TxZoneMaxPx(thicknessFallbackPx),
    microMaxPx: resolveLayer5MicroMaxPx(thicknessFallbackPx),
    weld: {
      ...layer5WeldPolicy,
      repairMaxGapPx: scale.layer5RepairMaxGapPx,
    },
    topology: { ...layer5TopologyPolicy },
    junction: { ...layer5JunctionPolicy },
  }
}
