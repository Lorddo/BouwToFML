import type { PrunePolicy, PruneTerminalKind } from '../engines/policy-types'
import {
  PIPELINE_ENDPOINT_EPS_PX,
  PIPELINE_MAX_PATH_LENGTH_RATIO,
  PIPELINE_PRESERVE_MIN_ANGLE_DEG,
  resolvePipelineScale,
} from '../engines/scale'

/** L3 — I-spur prune only (no move). Golden: CURRENT prune-i-spurs. */
const SCALE_REF30 = resolvePipelineScale()
const layer3PrunePolicy: PrunePolicy = {
  layerId: 3,
  thicknessFallbackPx: SCALE_REF30.thicknessFallbackRefPx,
  hvBandPx: SCALE_REF30.hvBandPx,
  maxPathLengthRatio: PIPELINE_MAX_PATH_LENGTH_RATIO,
  endpointEpsPx: PIPELINE_ENDPOINT_EPS_PX,
  junctionSnapPx: 0,
  mode: 'iterative-tx',
  terminalKinds: ['T', 'X'] satisfies readonly PruneTerminalKind[],
  protectStructuralTx: false,
  collinearMaxDeg: PIPELINE_PRESERVE_MIN_ANGLE_DEG,
}

export function resolveLayer3PrunePolicy(referenceWallThicknessPx?: number): PrunePolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    ...layer3PrunePolicy,
    thicknessFallbackPx: scale.thicknessFallbackRefPx,
    hvBandPx: scale.hvBandPx,
  }
}
