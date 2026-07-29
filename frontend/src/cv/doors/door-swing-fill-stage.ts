import { DOOR_SWING_TUNING, wallRescueMatch, type RefMatch } from './door-swing-filter-matching'
import type {
  DoorSwingDiagnosticStatus,
  DoorSwingHypothesis,
  DoorSwingRefBand,
  DoorSwingRootDiagnostic,
  DoorSizeBandPx,
} from './types'

/**
 * Stage-2 pass A: wall-faces die Stage-1 als seed weigerde (`rejected_outside_or_wall`),
 * maar wél op size/aspect bij een deur-ref passen → één individuele hypothese per face
 * (geen cluster). Stage-2 fill (`runDoorFillFilter`) beslist of de bbox-vulling bij de
 * ref past.
 */
export function buildWallRejectedFillCandidates(params: {
  diagnostics: DoorSwingRootDiagnostic[]
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  aspectToleranceRatio?: number
  wallFillAspectToleranceRatio?: number
  matchWallRescue?: (
    bbox: { width: number; height: number },
    refBands: DoorSwingRefBand[],
    sizeBand: DoorSizeBandPx,
    aspectToleranceRatio: number,
  ) => RefMatch | null
}): DoorSwingHypothesis[] {
  const aspectToleranceRatio = Math.max(
    params.aspectToleranceRatio ?? DOOR_SWING_TUNING.defaultAspectToleranceRatio,
    params.wallFillAspectToleranceRatio ?? DOOR_SWING_TUNING.wallFillAspectToleranceRatio,
  )
  if (params.refBands.length === 0) return []

  const matchWallRescue = params.matchWallRescue ?? wallRescueMatch
  const candidates: DoorSwingHypothesis[] = []
  const sorted = [...params.diagnostics].sort((a, b) => a.root - b.root)
  for (const row of sorted) {
    if (row.status !== ('rejected_outside_or_wall' satisfies DoorSwingDiagnosticStatus)) continue
    if (row.className !== 'wall') continue
    // Size + ruimere aspect-gate; area/fill-abs bewust niet (Stage-2 fill beslist).
    const match = matchWallRescue(row.bbox, params.refBands, params.sizeBand, aspectToleranceRatio)
    if (!match) continue
    candidates.push({
      id: `door-swing-wall-fill-${row.root}`,
      faceIds: [row.root],
      unionBBox: { ...row.bbox },
      filledAreaPx: Math.max(0, Math.round(row.areaPx)),
      score: match.score,
      source: 'single',
      matchedRefIndex: match.matchedRefIndex,
    })
  }
  return candidates
}

/** Stage-1 + wall-fill-kandidaten, zonder faces die Stage-1 al claimde. */
export function mergeHypothesesForFillStage(params: {
  stage1Hypotheses: DoorSwingHypothesis[]
  wallFillCandidates: DoorSwingHypothesis[]
}): DoorSwingHypothesis[] {
  const claimed = new Set<number>()
  for (const hyp of params.stage1Hypotheses) {
    for (const faceId of hyp.faceIds) claimed.add(faceId)
  }
  const extras = params.wallFillCandidates.filter((hyp) =>
    hyp.faceIds.every((faceId) => !claimed.has(faceId)),
  )
  return [...params.stage1Hypotheses, ...extras]
}
