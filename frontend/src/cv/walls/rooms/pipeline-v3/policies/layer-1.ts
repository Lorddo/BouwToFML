import type { Layer1RawPolicy } from '../engines/policy-types'
import { resolvePipelineScale } from '../engines/scale'

/** L1 — raw WASM skeleton + polyline + ruwe junctions. Golden: CURRENT copy. */
const SCALE_REF30 = resolvePipelineScale()
export const layer1RawPolicy: Layer1RawPolicy = {
  layerId: 1,
  junctionGraphSnapPx: SCALE_REF30.layer1JunctionGraphSnapPx,
}

export function resolveLayer1RawPolicy(referenceWallThicknessPx?: number): Layer1RawPolicy {
  const scale = resolvePipelineScale(referenceWallThicknessPx)
  return {
    layerId: 1,
    junctionGraphSnapPx: scale.layer1JunctionGraphSnapPx,
  }
}
