import { resolveClassAtLabel, type RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type {
  ResolvedWindowCandidate,
  WindowAxelHypothesis,
  WindowEvidenceAcceptance,
} from '@/cv/windows'

/** Minimale stage-cache shape voor demote-prune (matches useWorkspaceWindowFaces). */
export type WindowStageCacheForPrune = {
  stage1Hypotheses: WindowAxelHypothesis[]
  stage2AcceptedHypotheses: WindowAxelHypothesis[]
  stage3AcceptedHypotheses: WindowAxelHypothesis[]
  stage3Accepted: WindowEvidenceAcceptance[]
  stage3AcceptedDoorframes: WindowEvidenceAcceptance[]
  stage4ResolvedWindows: ResolvedWindowCandidate[]
  stage4ResolvedDoorframes: ResolvedWindowCandidate[]
  stage1AcceptedCount: number
  stage3AcceptedByFraming: number
  stage3AcceptedByStripStack: number
  stage3DoorframeAcceptedCount: number
}

function classAt(
  faceId: number,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): RoomRasterClass | undefined {
  return resolveClassAtLabel(faceId, parentMap, classification, undefined)
}

function hasClass(
  faceIds: Iterable<number>,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
  want: RoomRasterClass,
): boolean {
  for (const faceId of faceIds) {
    if (faceId > 0 && classAt(faceId, classification, parentMap) === want) return true
  }
  return false
}

function hasWindowOrDoorframe(
  faceIds: Iterable<number>,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): boolean {
  for (const faceId of faceIds) {
    if (!(faceId > 0)) continue
    const cls = classAt(faceId, classification, parentMap)
    if (cls === 'window' || cls === 'doorframe') return true
  }
  return false
}

/** Framing: glas; strip_stack: glas + rails (zelfde contract als Stage-4 filter). */
export function windowCandidateStillClassifiedAsWindow(
  candidate: Pick<ResolvedWindowCandidate, 'evidence' | 'faceIds' | 'evidenceFaceIds'>,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number> = new Map(),
): boolean {
  const ids =
    candidate.evidence === 'strip_stack'
      ? [...candidate.faceIds, ...candidate.evidenceFaceIds]
      : candidate.faceIds
  return hasClass(ids, classification, parentMap, 'window')
}

export function windowAcceptanceStillClassifiedAsWindow(
  entry: WindowEvidenceAcceptance,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number> = new Map(),
): boolean {
  return windowCandidateStillClassifiedAsWindow(
    {
      evidence: entry.evidence,
      faceIds: entry.hypothesis.faceIds,
      evidenceFaceIds: entry.evidenceFaceIds,
    },
    classification,
    parentMap,
  )
}

export function doorframeCandidateStillClassified(
  candidate: Pick<ResolvedWindowCandidate, 'faceIds' | 'evidenceFaceIds'>,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number> = new Map(),
): boolean {
  return hasClass(
    [...candidate.faceIds, ...candidate.evidenceFaceIds],
    classification,
    parentMap,
    'doorframe',
  )
}

/**
 * Na handmatige demote: drop hypotheses/resolved waarvan geen face meer
 * `window` / `doorframe` is. Geen Stage-herdetectie — alleen cache-prune.
 */
export function pruneWindowStageCacheByClassification<T extends WindowStageCacheForPrune>(
  cache: T,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number> = new Map(),
): T {
  const stage1Hypotheses = cache.stage1Hypotheses.filter((hyp) =>
    hasWindowOrDoorframe(hyp.faceIds, classification, parentMap),
  )
  const stage2AcceptedHypotheses = cache.stage2AcceptedHypotheses.filter((hyp) =>
    hasClass(hyp.faceIds, classification, parentMap, 'window'),
  )
  const stage3Accepted = cache.stage3Accepted.filter((entry) =>
    windowAcceptanceStillClassifiedAsWindow(entry, classification, parentMap),
  )
  const stage3AcceptedHypotheses = stage3Accepted.map((entry) => entry.hypothesis)
  const stage3AcceptedDoorframes = cache.stage3AcceptedDoorframes.filter((entry) =>
    doorframeCandidateStillClassified(
      {
        faceIds: entry.hypothesis.faceIds,
        evidenceFaceIds: entry.evidenceFaceIds,
      },
      classification,
      parentMap,
    ),
  )
  const stage4ResolvedWindows = cache.stage4ResolvedWindows.filter((window) =>
    windowCandidateStillClassifiedAsWindow(window, classification, parentMap),
  )
  const stage4ResolvedDoorframes = cache.stage4ResolvedDoorframes.filter((window) =>
    doorframeCandidateStillClassified(window, classification, parentMap),
  )

  return {
    ...cache,
    stage1Hypotheses,
    stage1AcceptedCount: stage1Hypotheses.length,
    stage2AcceptedHypotheses,
    stage3Accepted,
    stage3AcceptedHypotheses,
    stage3AcceptedDoorframes,
    stage4ResolvedWindows,
    stage4ResolvedDoorframes,
    stage3AcceptedByFraming: stage3Accepted.filter((e) => e.evidence === 'framing').length,
    stage3AcceptedByStripStack: stage3Accepted.filter((e) => e.evidence === 'strip_stack').length,
    stage3DoorframeAcceptedCount: stage3AcceptedDoorframes.length,
  }
}
