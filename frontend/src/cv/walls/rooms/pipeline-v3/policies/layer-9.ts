import type { CollapsePolicy, JunctionGraphPolicy, WeldPolicy } from '../engines/policy-types'
import { resolvePipelineScale } from '../engines/scale'
import { capOffsetTolerancePx } from '../engines/collapse/thickness'
import {
  baseCollapsePolicy,
  collapseJunctionPolicy,
  collapseWeldPolicy,
  scaleCollapsePolicy,
} from './collapse-base'

/** L9 dissolve — chain + stair-stub + parallel-cover. */
export const layer9CollapsePolicy: CollapsePolicy = baseCollapsePolicy(9, {
  enableStubCollapse: true,
  enableParallelCover: true,
  enableMicroCornerAbsorb: false,
  enableChainAxisStraighten: false,
})

const layer9WeldPolicy = collapseWeldPolicy(9)
const layer9JunctionPolicy = collapseJunctionPolicy(9)

export interface Layer9DissolvePolicy {
  layerId: 9
  collapse: CollapsePolicy
  weld: WeldPolicy
  junction: JunctionGraphPolicy
}

export function resolveLayer9DissolvePolicy(
  referenceWallThicknessPx?: number,
  bandBoundariesPx?: { midBoundaryPx: number; maxBoundaryPx: number },
): Layer9DissolvePolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  const scaled = scaleCollapsePolicy(layer9CollapsePolicy, scale)
  return {
    layerId: 9,
    collapse: {
      ...scaled,
      ...(bandBoundariesPx ? { bandBoundariesPx } : {}),
      // Mid-cap so max-ref does not inflate stub tier enough to eat façade jogs.
      orthoStubTierMaxPx: capOffsetTolerancePx(scaled.orthoStubTierMaxPx, bandBoundariesPx),
    },
    weld: { ...layer9WeldPolicy },
    junction: { ...layer9JunctionPolicy },
  }
}
