import type { HvPolicy, WeldPolicy } from '../engines/policy-types'
import {
  PIPELINE_JUNCTION_SHIFT_MAX_RATIO,
  PIPELINE_MAX_AXIS_SHIFT_FROM_OWN_RATIO,
  PIPELINE_NEAR_WELD_EPS_PX,
  PIPELINE_REPOSITION_TOLERANCE_RATIO,
  PIPELINE_SEPARATE_WALL_RATIO,
  PIPELINE_THICKNESS_MATCH_MIN_RATIO,
  resolvePipelineScale,
} from '../engines/scale'

/**
 * L4 — H/V position only (Copy6/7 golden).
 * No endpoint-seal: weld/junction policies stay scaffolded for later layers, unused by L4 orchestrator.
 */
const SCALE_REF30 = resolvePipelineScale()
export const layer4HvPolicy: HvPolicy = {
  layerId: 4,
  /** Copy6/7: LAYER4_JUNCTION_ENDPOINT_SNAP_PX */
  prePositionSnapPx: SCALE_REF30.hvPrePositionSnapPx,
  /** Bare HV — no post-seal snap */
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

/** Scaffold only — L4 orchestrator does not call weld. */
export const layer4WeldPolicy: WeldPolicy = {
  layerId: 4,
  nearEndpointGapPx: 1.25,
  endpointEpsPx: PIPELINE_NEAR_WELD_EPS_PX,
  repairMaxGapPx: 0,
}

export function resolveLayer4HvPolicy(referenceWallThicknessPx?: number): HvPolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    layerId: 4,
    prePositionSnapPx: scale.hvPrePositionSnapPx,
    postPositionSnapPx: 0,
    flatBandPx: scale.hvBandPx,
    thicknessFallbackPx: scale.thicknessFallbackBasePx,
    thicknessSampleInsetPx: scale.hvThicknessSampleInsetPx,
    repositionToleranceRatio: PIPELINE_REPOSITION_TOLERANCE_RATIO,
    repositionToleranceMinPx: scale.hvRepositionToleranceMinPx,
    repositionToleranceMaxPx: scale.hvRepositionToleranceMaxPx,
    separateWallRatio: PIPELINE_SEPARATE_WALL_RATIO,
    junctionShiftMaxRatio: PIPELINE_JUNCTION_SHIFT_MAX_RATIO,
    maxAxisShiftFromOwnRatio: PIPELINE_MAX_AXIS_SHIFT_FROM_OWN_RATIO,
    thicknessMatchMinRatio: PIPELINE_THICKNESS_MATCH_MIN_RATIO,
    collinearChainMaxSpreadPx: scale.hvCollinearChainMaxSpreadPx,
  }
}
