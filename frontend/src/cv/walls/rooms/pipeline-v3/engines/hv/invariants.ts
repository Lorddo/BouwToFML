import type { RoomWallJunction } from '../../../room-wall-skeleton-types'
import type { PipelineV3Layer3Result, PipelineV3Layer4Result } from '../../types'

type JunctionKindCounts = Record<'I' | 'L' | 'T' | 'X', number>

function countJunctionKinds(junctions: RoomWallJunction[]): JunctionKindCounts {
  const counts: JunctionKindCounts = { I: 0, L: 0, T: 0, X: 0 }
  for (const junction of junctions) counts[junction.kind] += 1
  return counts
}

function countsEqual(a: JunctionKindCounts, b: JunctionKindCounts): boolean {
  return a.I === b.I && a.L === b.L && a.T === b.T && a.X === b.X
}

/**
 * Copy6/7 L4 invariants: segment/junction counts + kinds must stay equal.
 * Encodes "alles mee": T may not become a bunch of I's.
 */
export function assertLayer4Invariants(params: {
  layer3: PipelineV3Layer3Result
  layer4: Omit<PipelineV3Layer4Result, 'invariantReport'>
}): PipelineV3Layer4Result['invariantReport'] {
  const errors: string[] = []
  const before = countJunctionKinds(params.layer3.allJunctionsPruned)
  const after = countJunctionKinds(params.layer4.allJunctionsPositioned)

  if (params.layer3.totalSegmentsPruned !== params.layer4.totalSegmentsPositioned) {
    errors.push(
      `segment count mismatch: layer3=${params.layer3.totalSegmentsPruned}, layer4=${params.layer4.totalSegmentsPositioned}`,
    )
  }
  if (params.layer3.totalJunctionsPruned !== params.layer4.totalJunctionsPositioned) {
    errors.push(
      `junction count mismatch: layer3=${params.layer3.totalJunctionsPruned}, layer4=${params.layer4.totalJunctionsPositioned}`,
    )
  }
  if (!countsEqual(before, after)) {
    errors.push(
      `junction kind mismatch: layer3=${JSON.stringify(before)} layer4=${JSON.stringify(after)}`,
    )
  }

  if (params.layer3.facesPruned.length !== params.layer4.facesPositioned.length) {
    errors.push(
      `face count mismatch: layer3=${params.layer3.facesPruned.length}, layer4=${params.layer4.facesPositioned.length}`,
    )
  } else {
    for (let i = 0; i < params.layer3.facesPruned.length; i += 1) {
      const source = params.layer3.facesPruned[i]
      const positioned = params.layer4.facesPositioned[i]
      if (source.rootLabel !== positioned.rootLabel) {
        errors.push(
          `face order mismatch at index ${i}: ${source.rootLabel} != ${positioned.rootLabel}`,
        )
        continue
      }
      if (source.segments.length !== positioned.segments.length) {
        errors.push(
          `face ${source.rootLabel} segment mismatch: ${source.segments.length} != ${positioned.segments.length}`,
        )
      }
      if (source.junctions.length !== positioned.junctions.length) {
        errors.push(
          `face ${source.rootLabel} junction mismatch: ${source.junctions.length} != ${positioned.junctions.length}`,
        )
      }
      const sourceKinds = countJunctionKinds(source.junctions)
      const positionedKinds = countJunctionKinds(positioned.junctions)
      if (!countsEqual(sourceKinds, positionedKinds)) {
        errors.push(`face ${source.rootLabel} junction kinds changed`)
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    junctionKindCountsBefore: before,
    junctionKindCountsAfter: after,
  }
}
