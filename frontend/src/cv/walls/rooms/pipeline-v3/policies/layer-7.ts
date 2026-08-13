import type { CollapsePolicy, Layer7AlignPolicy } from '../engines/policy-types'
import { resolvePipelineScale } from '../engines/scale'
import {
  baseCollapsePolicy,
  collapseJunctionPolicy,
  collapseWeldPolicy,
  scaleCollapsePolicy,
} from './collapse-base'

/** L7 — inter-junction chain collapse (policy ≠ L9; no stubs/cover). */
export const layer7CollapsePolicy: CollapsePolicy = baseCollapsePolicy(7, {
  enableStubCollapse: false,
  enableParallelCover: false,
  enableMicroCornerAbsorb: false,
  enableChainAxisStraighten: false,
})

const layer7WeldPolicy = collapseWeldPolicy(7)
const layer7JunctionPolicy = collapseJunctionPolicy(7)

export function resolveLayer7AlignPolicy(
  referenceWallThicknessPx?: number,
  bandBoundariesPx?: { midBoundaryPx: number; maxBoundaryPx: number },
): Layer7AlignPolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    layerId: 7,
    collapse: {
      ...scaleCollapsePolicy(layer7CollapsePolicy, scale),
      ...(bandBoundariesPx ? { bandBoundariesPx } : {}),
    },
    weld: { ...layer7WeldPolicy },
    junction: { ...layer7JunctionPolicy },
  }
}
