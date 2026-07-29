import type { Layer2JitterPolicy } from '../engines/policy-types'
import {
  PIPELINE_MERGE_TOLERANCE_RATIO,
  PIPELINE_PRESERVE_MIN_ANGLE_DEG,
  PIPELINE_STRUCTURAL_ANGLE_DEG,
  resolvePipelineScale,
} from '../engines/scale'

/** L2 — WASM jitter merge + exact dedupe. Golden: CURRENT copy. */
const SCALE_REF30 = resolvePipelineScale()
export const layer2JitterPolicy: Layer2JitterPolicy = {
  layerId: 2,
  preserveMinAngleDeg: PIPELINE_PRESERVE_MIN_ANGLE_DEG,
  structuralAngleDeg: PIPELINE_STRUCTURAL_ANGLE_DEG,
  tArmMinBranchPx: SCALE_REF30.layer2TArmMinBranchPx,
  mergeToleranceRatio: PIPELINE_MERGE_TOLERANCE_RATIO,
  mergeToleranceMinPx: SCALE_REF30.layer2MergeToleranceMinPx,
  mergeToleranceMaxPx: SCALE_REF30.layer2MergeToleranceMaxPx,
  thicknessSampleInsetPx: SCALE_REF30.hvThicknessSampleInsetPx,
  thicknessFallbackPx: SCALE_REF30.thicknessFallbackBasePx,
  junctionGraphSnapPx: 0,
}

export function resolveLayer2JitterPolicy(referenceWallThicknessPx?: number): Layer2JitterPolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    layerId: 2,
    preserveMinAngleDeg: PIPELINE_PRESERVE_MIN_ANGLE_DEG,
    structuralAngleDeg: PIPELINE_STRUCTURAL_ANGLE_DEG,
    tArmMinBranchPx: scale.layer2TArmMinBranchPx,
    mergeToleranceRatio: PIPELINE_MERGE_TOLERANCE_RATIO,
    mergeToleranceMinPx: scale.layer2MergeToleranceMinPx,
    mergeToleranceMaxPx: scale.layer2MergeToleranceMaxPx,
    thicknessSampleInsetPx: scale.hvThicknessSampleInsetPx,
    thicknessFallbackPx: scale.thicknessFallbackBasePx,
    junctionGraphSnapPx: 0,
  }
}

export function resolveMergeTolerancePx(
  localThicknessPx: number,
  referenceFallbackPx?: number,
  policy: Layer2JitterPolicy = layer2JitterPolicy,
): number {
  const base = Math.max(
    localThicknessPx,
    referenceFallbackPx ?? 0,
    policy.thicknessFallbackPx,
  )
  const raw = policy.mergeToleranceRatio * base
  return Math.min(
    policy.mergeToleranceMaxPx,
    Math.max(policy.mergeToleranceMinPx, Math.round(raw)),
  )
}
