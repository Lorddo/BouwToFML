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

/** L10 FML input — axis straighten + micro corner-jog absorb (no stub/cover). */
const SCALE_REF30 = resolvePipelineScale()
export const layer10CollapsePolicy: CollapsePolicy = baseCollapsePolicy(10, {
  enableStubCollapse: false,
  enableParallelCover: false,
  enableMicroCornerAbsorb: true,
  enableChainAxisStraighten: true,
  /** Cover BouwTek11 T/L micro-jog (~4.5px) without merging true double walls. */
  chainAxisMaxSpreadPx: SCALE_REF30.collapseChainAxisMaxSpreadPx,
})

const layer10WeldPolicy = collapseWeldPolicy(10)
const layer10JunctionPolicy = collapseJunctionPolicy(10)

export interface Layer10FmlPolicy {
  layerId: 10
  collapse: CollapsePolicy
  weld: WeldPolicy
  junction: JunctionGraphPolicy
}

export function resolveLayer10FmlPolicy(referenceWallThicknessPx?: number): Layer10FmlPolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    layerId: 10,
    collapse: scaleCollapsePolicy(
      layer10CollapsePolicy,
      scale,
      scale.collapseChainAxisMaxSpreadPx,
    ),
    weld: { ...layer10WeldPolicy },
    junction: { ...layer10JunctionPolicy },
  }
}
