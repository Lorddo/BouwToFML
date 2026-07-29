/** Gaps pipeline entry — default Solid face-demote. */

import { runGapsLayer1FaceDemote } from './layer-1-face-demote'
import { resolveSolidFaceDemotePolicy } from './policies/solid'
import type { GapsLayer1Result, RunGapsPipelineParams } from './types'

export function runGapsPipeline(params: RunGapsPipelineParams): GapsLayer1Result {
  const policyId = params.policyId ?? 'solid'
  if (policyId !== 'solid') {
    throw new Error(`runGapsPipeline: policy '${policyId}' is not implemented (only solid)`)
  }
  return runGapsLayer1FaceDemote({
    labelsData: params.labelsData,
    wallMaskData: params.wallMaskData,
    components: params.components,
    parentMap: params.parentMap,
    priorClassification: params.priorClassification,
    policy: resolveSolidFaceDemotePolicy(),
    groupBy: params.groupBy,
    maxRefFaceAreaPx: params.maxRefFaceAreaPx,
  })
}
