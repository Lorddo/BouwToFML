import type {
  HvPolicy,
  WeldPolicy,
  PrunePolicy,
  JunctionGraphPolicy,
  PruneTerminalKind,
} from '../engines/policy-types'
import {
  PIPELINE_ENDPOINT_EPS_PX,
  PIPELINE_JUNCTION_SHIFT_MAX_RATIO,
  PIPELINE_MAX_AXIS_SHIFT_FROM_OWN_RATIO,
  PIPELINE_MAX_PATH_LENGTH_RATIO,
  PIPELINE_PRESERVE_MIN_ANGLE_DEG,
  PIPELINE_REPOSITION_TOLERANCE_RATIO,
  PIPELINE_SEPARATE_WALL_RATIO,
  PIPELINE_THICKNESS_MATCH_MIN_RATIO,
  resolvePipelineScale,
} from '../engines/scale'

/**
 * L8 — bare HV (mask distance map) + once I→L/T/X prune.
 * HV thresholds match L4 bare; layerId=8; no seal (postSnap=0).
 * Weld = 1px graph-prep only (CURRENT weldSegmentsForJunctionGraph).
 */
const SCALE_REF30 = resolvePipelineScale()
export const layer8HvPolicy: HvPolicy = {
  layerId: 8,
  prePositionSnapPx: SCALE_REF30.hvPrePositionSnapPx,
  postPositionSnapPx: 0,
  flatBandPx: SCALE_REF30.hvBandPx,
  thicknessFallbackPx: SCALE_REF30.thicknessFallbackBasePx,
  thicknessSampleInsetPx: SCALE_REF30.hvThicknessSampleInsetPx,
  repositionToleranceRatio: PIPELINE_REPOSITION_TOLERANCE_RATIO,
  repositionToleranceMinPx: SCALE_REF30.hvRepositionToleranceMinPx,
  repositionToleranceMaxPx: SCALE_REF30.hvRepositionToleranceMaxPx,
  separateWallRatio: PIPELINE_SEPARATE_WALL_RATIO,
  junctionShiftMaxRatio: PIPELINE_JUNCTION_SHIFT_MAX_RATIO,
  maxAxisShiftFromOwnRatio: PIPELINE_MAX_AXIS_SHIFT_FROM_OWN_RATIO,
  thicknessMatchMinRatio: PIPELINE_THICKNESS_MATCH_MIN_RATIO,
  collinearChainMaxSpreadPx: SCALE_REF30.hvCollinearChainMaxSpreadPx,
}

export const layer8WeldPolicy: WeldPolicy = {
  layerId: 8,
  nearEndpointGapPx: 1,
  endpointEpsPx: PIPELINE_ENDPOINT_EPS_PX,
  repairMaxGapPx: 0,
}

const layer8JunctionPolicy: JunctionGraphPolicy = {
  layerId: 8,
  snapPx: 0,
  weldBeforeGraph: true,
}

export const layer8PrunePolicy: PrunePolicy = {
  layerId: 8,
  thicknessFallbackPx: SCALE_REF30.thicknessFallbackRefPx,
  hvBandPx: SCALE_REF30.hvBandPx,
  maxPathLengthRatio: PIPELINE_MAX_PATH_LENGTH_RATIO,
  endpointEpsPx: PIPELINE_ENDPOINT_EPS_PX,
  junctionSnapPx: 0,
  mode: 'once-ltx',
  terminalKinds: ['L', 'T', 'X'] satisfies readonly PruneTerminalKind[],
  protectStructuralTx: true,
  collinearMaxDeg: PIPELINE_PRESERVE_MIN_ANGLE_DEG,
}

export type Layer8FinalizePolicy = {
  layerId: 8
  hv: HvPolicy
  weld: WeldPolicy
  junction: JunctionGraphPolicy
  prune: PrunePolicy
}

export function resolveLayer8FinalizePolicy(referenceWallThicknessPx?: number): Layer8FinalizePolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  const thicknessFallbackPx = scale.thicknessFallbackRefPx
  return {
    layerId: 8,
    hv: {
      ...layer8HvPolicy,
      prePositionSnapPx: scale.hvPrePositionSnapPx,
      flatBandPx: scale.hvBandPx,
      thicknessFallbackPx: scale.thicknessFallbackBasePx,
      thicknessSampleInsetPx: scale.hvThicknessSampleInsetPx,
      repositionToleranceMinPx: scale.hvRepositionToleranceMinPx,
      repositionToleranceMaxPx: scale.hvRepositionToleranceMaxPx,
      collinearChainMaxSpreadPx: scale.hvCollinearChainMaxSpreadPx,
    },
    weld: { ...layer8WeldPolicy },
    junction: { ...layer8JunctionPolicy },
    prune: { ...layer8PrunePolicy, thicknessFallbackPx, hvBandPx: scale.hvBandPx },
  }
}
