import type {
  CollapsePolicy,
  JunctionGraphPolicy,
  WeldPolicy,
} from '../engines/policy-types'
import { resolvePipelineScale } from '../engines/scale'
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

export function resolveLayer9DissolvePolicy(referenceWallThicknessPx?: number): Layer9DissolvePolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    layerId: 9,
    collapse: scaleCollapsePolicy(layer9CollapsePolicy, scale),
    weld: { ...layer9WeldPolicy },
    junction: { ...layer9JunctionPolicy },
  }
}
