import { tally } from '@/core/diagnostics'
import type {
  DoorFillFilterResult,
  DoorFillFilterStats,
  DoorFillRejection,
  DoorSwingHypothesis,
  DoorSwingRefBand,
} from './types'

// ESC:D-25 (B)
export const DOOR_FILL_BAND_MIN_RATIO = 0.8
export const DOOR_FILL_BAND_MAX_RATIO = 1.2

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function resolveFillRatio(areaPx: number, width: number, height: number): number {
  const boxArea = Math.max(1, width * height)
  return clamp01(areaPx / boxArea)
}

function refFillRatio(ref: DoorSwingRefBand): number {
  return resolveFillRatio(ref.areaPx, ref.swingWpx, ref.swingHpx)
}

function sortByStableId(hypotheses: DoorSwingHypothesis[]): DoorSwingHypothesis[] {
  return [...hypotheses].sort((a, b) => a.id.localeCompare(b.id))
}

export function runDoorFillFilter(params: {
  hypotheses: DoorSwingHypothesis[]
  refBands: DoorSwingRefBand[]
  minRatio?: number
  maxRatio?: number
}): DoorFillFilterResult {
  const minRatio = params.minRatio ?? DOOR_FILL_BAND_MIN_RATIO
  const maxRatio = params.maxRatio ?? DOOR_FILL_BAND_MAX_RATIO
  const accepted: DoorSwingHypothesis[] = []
  const rejected: DoorFillRejection[] = []
  const stats: DoorFillFilterStats = {
    minRatio,
    maxRatio,
    acceptedCount: 0,
    rejectedTooFull: 0,
    rejectedTooEmpty: 0,
    rejectedMissingRef: 0,
  }

  for (const hypothesis of sortByStableId(params.hypotheses)) {
    const ref = params.refBands[hypothesis.matchedRefIndex]
    if (!ref) {
      stats.rejectedMissingRef += 1
      rejected.push({
        hypothesis,
        candidateFill: resolveFillRatio(
          hypothesis.filledAreaPx,
          hypothesis.unionBBox.width,
          hypothesis.unionBBox.height,
        ),
        refFill: null,
        minAllowedFill: null,
        maxAllowedFill: null,
        reason: 'missing_ref',
      })
      continue
    }

    const candidateFill = resolveFillRatio(
      hypothesis.filledAreaPx,
      hypothesis.unionBBox.width,
      hypothesis.unionBBox.height,
    )
    const refFill = refFillRatio(ref)
    const minAllowedFill = clamp01(refFill * minRatio)
    const maxAllowedFill = clamp01(refFill * maxRatio)

    if (candidateFill < minAllowedFill) {
      stats.rejectedTooEmpty += 1
      tally('D-25', 'too_empty')
      rejected.push({
        hypothesis,
        candidateFill,
        refFill,
        minAllowedFill,
        maxAllowedFill,
        reason: 'too_empty',
      })
      continue
    }
    if (candidateFill > maxAllowedFill) {
      stats.rejectedTooFull += 1
      tally('D-25', 'too_full')
      rejected.push({
        hypothesis,
        candidateFill,
        refFill,
        minAllowedFill,
        maxAllowedFill,
        reason: 'too_full',
      })
      continue
    }

    accepted.push(hypothesis)
  }

  stats.acceptedCount = accepted.length
  return { accepted, rejected, stats }
}
