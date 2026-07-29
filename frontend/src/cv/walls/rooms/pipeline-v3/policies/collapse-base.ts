/**
 * Shared collapse policy defaults for L7 / L9 / L10.
 * L8 stays apart (HV/prune, not CollapsePolicy).
 */
import type { CollapsePolicy, JunctionGraphPolicy, WeldPolicy } from '../engines/policy-types'
import {
  PIPELINE_AXIS_COVER_EPS_PX,
  PIPELINE_COLLINEAR_THICKNESS_BYPASS_DEG,
  PIPELINE_ENDPOINT_EPS_PX,
  PIPELINE_PRESERVE_MIN_ANGLE_DEG,
  PIPELINE_STRUCTURAL_ANGLE_DEG,
  PIPELINE_THICKNESS_MATCH_MIN_RATIO,
  type PipelineScale,
  resolvePipelineScale,
} from '../engines/scale'

/** Enable-flags + optional axis-spread override (L10 uses collapseChainAxisMaxSpreadPx). */
export type CollapsePolicyFlags = Pick<
  CollapsePolicy,
  | 'enableStubCollapse'
  | 'enableParallelCover'
  | 'enableMicroCornerAbsorb'
  | 'enableChainAxisStraighten'
> & {
  chainAxisMaxSpreadPx?: number
}

/** Weld triplet shared by L7/L9/L10 rebuild (`nearEndpointGapPx: 1`). */
export const COLLAPSE_WELD_SHARED = {
  nearEndpointGapPx: 1,
  endpointEpsPx: PIPELINE_ENDPOINT_EPS_PX,
  repairMaxGapPx: 0,
} as const satisfies Omit<WeldPolicy, 'layerId'>

/** Junction triplet shared by L7/L9/L10 (`snapPx: 0`, `weldBeforeGraph: true`). */
export const COLLAPSE_JUNCTION_SHARED = {
  snapPx: 0,
  weldBeforeGraph: true,
} as const satisfies Omit<JunctionGraphPolicy, 'layerId'>

export function collapseWeldPolicy(layerId: WeldPolicy['layerId']): WeldPolicy {
  return { layerId, ...COLLAPSE_WELD_SHARED }
}

export function collapseJunctionPolicy(
  layerId: JunctionGraphPolicy['layerId'],
): JunctionGraphPolicy {
  return { layerId, ...COLLAPSE_JUNCTION_SHARED }
}

/**
 * Static CollapsePolicy for L7/L9/L10 at default scale.
 * Differs only by layerId, enable*-flags, and optional chainAxisMaxSpreadPx.
 */
export function baseCollapsePolicy(
  layerId: CollapsePolicy['layerId'],
  flags: CollapsePolicyFlags,
  scale: PipelineScale = resolvePipelineScale(),
): CollapsePolicy {
  return {
    layerId,
    hvBandPx: scale.hvBandPx,
    collinearMaxDeg: PIPELINE_PRESERVE_MIN_ANGLE_DEG,
    structuralLDeg: PIPELINE_STRUCTURAL_ANGLE_DEG,
    collinearThicknessBypassDeg: PIPELINE_COLLINEAR_THICKNESS_BYPASS_DEG,
    minChainSegments: 2,
    junctionAnchorPx: scale.collapseJunctionAnchorPx,
    crossAxisTolPx: scale.collapseCrossAxisTolPx,
    thicknessMatchMinRatio: PIPELINE_THICKNESS_MATCH_MIN_RATIO,
    thicknessFallbackPx: scale.thicknessFallbackBasePx,
    thicknessSampleInsetPx: scale.hvThicknessSampleInsetPx,
    enableStubCollapse: flags.enableStubCollapse,
    enableParallelCover: flags.enableParallelCover,
    enableMicroCornerAbsorb: flags.enableMicroCornerAbsorb,
    enableChainAxisStraighten: flags.enableChainAxisStraighten,
    orthoStubMaxPx: scale.collapseOrthoStubMaxPx,
    orthoStubTierMaxPx: scale.collapseOrthoStubTierMaxPx,
    axisCoverEpsPx: PIPELINE_AXIS_COVER_EPS_PX,
    microCornerMaxPx: scale.collapseMicroCornerMaxPx,
    chainAxisMaxSpreadPx: flags.chainAxisMaxSpreadPx ?? scale.hvRepositionToleranceMinPx,
  }
}

/** Re-apply pipeline scale onto a static collapse policy (resolve* helpers). */
export function scaleCollapsePolicy(
  base: CollapsePolicy,
  scale: PipelineScale,
  chainAxisMaxSpreadPx: number = scale.hvRepositionToleranceMinPx,
): CollapsePolicy {
  return {
    ...base,
    hvBandPx: scale.hvBandPx,
    junctionAnchorPx: scale.collapseJunctionAnchorPx,
    crossAxisTolPx: scale.collapseCrossAxisTolPx,
    thicknessFallbackPx: scale.thicknessFallbackBasePx,
    thicknessSampleInsetPx: scale.hvThicknessSampleInsetPx,
    orthoStubMaxPx: scale.collapseOrthoStubMaxPx,
    orthoStubTierMaxPx: scale.collapseOrthoStubTierMaxPx,
    microCornerMaxPx: scale.collapseMicroCornerMaxPx,
    chainAxisMaxSpreadPx,
  }
}
