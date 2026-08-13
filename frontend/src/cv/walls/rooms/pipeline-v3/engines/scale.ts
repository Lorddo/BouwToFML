const PIPELINE_REF_FALLBACK_PX = 30

export const PIPELINE_HV_ANGLE_TOL_DEG = 12
export const PIPELINE_PRESERVE_MIN_ANGLE_DEG = 25
export const PIPELINE_STRUCTURAL_ANGLE_DEG = 26
export const PIPELINE_COLLINEAR_THICKNESS_BYPASS_DEG = 3

export const PIPELINE_MERGE_TOLERANCE_RATIO = 0.2
export const PIPELINE_REPOSITION_TOLERANCE_RATIO = 0.35
export const PIPELINE_SEPARATE_WALL_RATIO = 0.7
export const PIPELINE_JUNCTION_SHIFT_MAX_RATIO = 0.45
export const PIPELINE_MAX_AXIS_SHIFT_FROM_OWN_RATIO = 0.4
export const PIPELINE_THICKNESS_MATCH_MIN_RATIO = 0.65
export const PIPELINE_MAX_PATH_LENGTH_RATIO = 1

// Epsilons blijven bewust vast (geen ref-schaling).
export const PIPELINE_ENDPOINT_EPS_PX = 1
export const PIPELINE_NEAR_WELD_EPS_PX = 1
export const PIPELINE_AXIS_COVER_EPS_PX = 1

const LAYER1_JUNCTION_GRAPH_SNAP_RATIO = 2 / 30

const LAYER2_T_ARM_MIN_BRANCH_RATIO = 8 / 30
const LAYER2_MERGE_TOL_MIN_RATIO = 2 / 30
const LAYER2_MERGE_TOL_MAX_RATIO = 8 / 30

const HV_PRE_POSITION_SNAP_RATIO = 2 / 30
const HV_BAND_RATIO = 8 / 30
const HV_THICKNESS_SAMPLE_INSET_RATIO = 6 / 30
const HV_REPOSITION_TOL_MIN_RATIO = 2 / 30
const HV_REPOSITION_TOL_MAX_RATIO = 12 / 30
const HV_COLLINEAR_CHAIN_SPREAD_RATIO = 8 / 30

const COLLAPSE_JUNCTION_ANCHOR_RATIO = 15 / 30
const COLLAPSE_CROSS_AXIS_TOL_RATIO = 5 / 30
const COLLAPSE_ORTHO_STUB_MAX_RATIO = 8 / 30
const COLLAPSE_ORTHO_STUB_TIER_MAX_RATIO = 8 / 30
const COLLAPSE_MICRO_CORNER_MAX_RATIO = 8 / 30
const COLLAPSE_CHAIN_AXIS_SPREAD_RATIO = 5 / 30

/** Schuine assen: banden en drempels als ratio van de muur-referentie. */
const OBLIQUE_MIN_MEMBER_LENGTH_RATIO = 4 / 30
const OBLIQUE_MIN_EVIDENCE_RATIO = 6
const OBLIQUE_MAX_MEMBER_OFFSET_RATIO = 0.25
/** Halve muurdikte: een trap blijft binnen zijn eigen muur. */
const OBLIQUE_CAPTURE_BAND_RATIO = 0.5
const OBLIQUE_MAX_ANCHOR_SHIFT_RATIO = COLLAPSE_JUNCTION_ANCHOR_RATIO
const OBLIQUE_RIDGE_OFFSET_MEDIAN_RATIO = 1 / 30
const OBLIQUE_RIDGE_MAX_SEARCH_RATIO = 0.75
const OBLIQUE_RIDGE_SAMPLE_STEP_RATIO = 2 / 30

const LAYER5_SAME_LINE_OFFSET_RATIO = 1.5 / 30
const LAYER5_REPAIR_MAX_GAP_RATIO = 4 / 30
const LAYER5_TX_STUB_MAX_RATIO = 3 / 30
const THICKNESS_FALLBACK_BASE_RATIO = 10 / 30

function scaleRounded(refPx: number, ratio: number, minPx = 1): number {
  return Math.max(minPx, Math.round(refPx * ratio))
}

function scaleFloat(refPx: number, ratio: number, minPx = 0): number {
  return Math.max(minPx, refPx * ratio)
}

export interface PipelineScale {
  refPx: number
  thicknessFallbackRefPx: number
  thicknessFallbackBasePx: number
  layer1JunctionGraphSnapPx: number
  layer2TArmMinBranchPx: number
  layer2MergeToleranceMinPx: number
  layer2MergeToleranceMaxPx: number
  hvPrePositionSnapPx: number
  hvBandPx: number
  hvThicknessSampleInsetPx: number
  hvRepositionToleranceMinPx: number
  hvRepositionToleranceMaxPx: number
  hvCollinearChainMaxSpreadPx: number
  collapseJunctionAnchorPx: number
  collapseCrossAxisTolPx: number
  collapseOrthoStubMaxPx: number
  collapseOrthoStubTierMaxPx: number
  collapseMicroCornerMaxPx: number
  collapseChainAxisMaxSpreadPx: number
  layer5SameLineMaxOffsetPx: number
  layer5RepairMaxGapPx: number
  layer5TxStubMaxPx: number
  obliqueMinMemberLengthPx: number
  obliqueMinEvidencePx: number
  obliqueMaxMemberOffsetPx: number
  obliqueCaptureBandPx: number
  obliqueMaxAnchorShiftPx: number
  obliqueRidgeOffsetMedianPx: number
  obliqueRidgeMaxSearchPx: number
  obliqueRidgeSampleStepPx: number
}

function resolvePipelineReferencePx(referenceWallThicknessPx?: number): number {
  if (referenceWallThicknessPx && referenceWallThicknessPx > 0) return referenceWallThicknessPx
  return PIPELINE_REF_FALLBACK_PX
}

export function resolvePipelineScale(referenceWallThicknessPx?: number): PipelineScale {
  const refPx = resolvePipelineReferencePx(referenceWallThicknessPx)
  return {
    refPx,
    thicknessFallbackRefPx: refPx,
    thicknessFallbackBasePx: scaleRounded(refPx, THICKNESS_FALLBACK_BASE_RATIO),
    layer1JunctionGraphSnapPx: scaleRounded(refPx, LAYER1_JUNCTION_GRAPH_SNAP_RATIO),
    layer2TArmMinBranchPx: scaleRounded(refPx, LAYER2_T_ARM_MIN_BRANCH_RATIO),
    layer2MergeToleranceMinPx: scaleRounded(refPx, LAYER2_MERGE_TOL_MIN_RATIO),
    layer2MergeToleranceMaxPx: scaleRounded(refPx, LAYER2_MERGE_TOL_MAX_RATIO),
    hvPrePositionSnapPx: scaleRounded(refPx, HV_PRE_POSITION_SNAP_RATIO),
    hvBandPx: scaleRounded(refPx, HV_BAND_RATIO),
    hvThicknessSampleInsetPx: scaleRounded(refPx, HV_THICKNESS_SAMPLE_INSET_RATIO),
    hvRepositionToleranceMinPx: scaleRounded(refPx, HV_REPOSITION_TOL_MIN_RATIO),
    hvRepositionToleranceMaxPx: scaleRounded(refPx, HV_REPOSITION_TOL_MAX_RATIO),
    hvCollinearChainMaxSpreadPx: scaleRounded(refPx, HV_COLLINEAR_CHAIN_SPREAD_RATIO),
    collapseJunctionAnchorPx: scaleRounded(refPx, COLLAPSE_JUNCTION_ANCHOR_RATIO),
    collapseCrossAxisTolPx: scaleRounded(refPx, COLLAPSE_CROSS_AXIS_TOL_RATIO),
    collapseOrthoStubMaxPx: scaleRounded(refPx, COLLAPSE_ORTHO_STUB_MAX_RATIO),
    collapseOrthoStubTierMaxPx: scaleRounded(refPx, COLLAPSE_ORTHO_STUB_TIER_MAX_RATIO),
    collapseMicroCornerMaxPx: scaleRounded(refPx, COLLAPSE_MICRO_CORNER_MAX_RATIO),
    collapseChainAxisMaxSpreadPx: scaleRounded(refPx, COLLAPSE_CHAIN_AXIS_SPREAD_RATIO),
    layer5SameLineMaxOffsetPx: scaleFloat(refPx, LAYER5_SAME_LINE_OFFSET_RATIO, 0.5),
    layer5RepairMaxGapPx: scaleRounded(refPx, LAYER5_REPAIR_MAX_GAP_RATIO),
    layer5TxStubMaxPx: scaleRounded(refPx, LAYER5_TX_STUB_MAX_RATIO),
    obliqueMinMemberLengthPx: scaleRounded(refPx, OBLIQUE_MIN_MEMBER_LENGTH_RATIO, 3),
    obliqueMinEvidencePx: scaleRounded(refPx, OBLIQUE_MIN_EVIDENCE_RATIO),
    obliqueMaxMemberOffsetPx: scaleRounded(refPx, OBLIQUE_MAX_MEMBER_OFFSET_RATIO),
    obliqueCaptureBandPx: scaleRounded(refPx, OBLIQUE_CAPTURE_BAND_RATIO),
    obliqueMaxAnchorShiftPx: scaleRounded(refPx, OBLIQUE_MAX_ANCHOR_SHIFT_RATIO),
    obliqueRidgeOffsetMedianPx: scaleFloat(refPx, OBLIQUE_RIDGE_OFFSET_MEDIAN_RATIO, 2),
    obliqueRidgeMaxSearchPx: scaleRounded(refPx, OBLIQUE_RIDGE_MAX_SEARCH_RATIO),
    obliqueRidgeSampleStepPx: scaleFloat(refPx, OBLIQUE_RIDGE_SAMPLE_STEP_RATIO, 2),
  }
}
