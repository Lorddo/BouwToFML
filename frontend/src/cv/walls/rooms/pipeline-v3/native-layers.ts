/**
 * Progressive V3: only layers 1..V3_NATIVE_THROUGH_LAYER run.
 * Missing layers are NOT filled from V2 — pipeline hard-stops; FML waits for L10.
 */
export const V3_PIPELINE_LAST_LAYER = 10 as const

/** Highest layer with a native V3 implementation. Bump only after that layer's child-plan gate. */
export const V3_NATIVE_THROUGH_LAYER = 10 as const

export function listIncompleteLayers(nativeThrough: number = V3_NATIVE_THROUGH_LAYER): number[] {
  const out: number[] = []
  for (let n = nativeThrough + 1; n <= V3_PIPELINE_LAST_LAYER; n += 1) {
    out.push(n)
  }
  return out
}

function isV3PipelineComplete(nativeThrough: number = V3_NATIVE_THROUGH_LAYER): boolean {
  return nativeThrough >= V3_PIPELINE_LAST_LAYER
}

export function isV3FmlReady(nativeThrough: number = V3_NATIVE_THROUGH_LAYER): boolean {
  return isV3PipelineComplete(nativeThrough)
}
