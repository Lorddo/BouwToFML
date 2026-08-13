import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { resolveClassAtLabel, type RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type {
  ResolvedWindowCandidate,
  WindowAxelHypothesis,
  WindowEvidenceAcceptance,
} from '@/cv/windows'
import { reconcileResolvedWindowsForClassification } from './window-faces-reconcile-classification'

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
 * `window` / `doorframe` is; Stage-4 strip demoted faces (+ bbox als `dual` meegegeven).
 * Geen Stage-herdetectie — alleen cache-prune. L14-bind reconcilieert opnieuw met dual.
 */
export function pruneWindowStageCacheByClassification<T extends WindowStageCacheForPrune>(
  cache: T,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number> = new Map(),
  dual: FaceDualSpace | null = null,
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
  // L14-pad: demoted faces mogen niet in resolved bbox/width blijven meelopen.
  const stage4ResolvedWindows = reconcileResolvedWindowsForClassification({
    resolved: cache.stage4ResolvedWindows,
    classification,
    parentMap,
    dual,
  })
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

function entryTouchesOrphans(
  faceIds: readonly number[],
  evidenceFaceIds: readonly number[],
  orphaned: ReadonlySet<number>,
): boolean {
  for (const faceId of faceIds) {
    if (faceId > 0 && orphaned.has(faceId)) return true
  }
  for (const faceId of evidenceFaceIds) {
    if (faceId > 0 && orphaned.has(faceId)) return true
  }
  return false
}

/**
 * Na deur-demote: wees-doorframes (niet meer aan een swing) terug naar window-stage.
 * Geen herdetectie — verplaats bestaande Stage-3/4 doorframe-entries.
 */
export function promoteOrphanedDoorframesToWindowsInStageCache<T extends WindowStageCacheForPrune>(
  cache: T,
  orphanedFaceIds: readonly number[],
): T {
  const orphaned = new Set(orphanedFaceIds.filter((id) => id > 0))
  if (orphaned.size === 0) return cache

  const keepDoorframes3: WindowEvidenceAcceptance[] = []
  const promote3: WindowEvidenceAcceptance[] = []
  for (const entry of cache.stage3AcceptedDoorframes) {
    if (entryTouchesOrphans(entry.hypothesis.faceIds, entry.evidenceFaceIds, orphaned)) {
      promote3.push(entry)
    } else {
      keepDoorframes3.push(entry)
    }
  }

  const keepDoorframes4: ResolvedWindowCandidate[] = []
  const promote4: ResolvedWindowCandidate[] = []
  for (const entry of cache.stage4ResolvedDoorframes) {
    if (entryTouchesOrphans(entry.faceIds, entry.evidenceFaceIds, orphaned)) {
      promote4.push(entry)
    } else {
      keepDoorframes4.push(entry)
    }
  }

  if (promote3.length === 0 && promote4.length === 0) return cache

  const existingStage3Ids = new Set(cache.stage3Accepted.map((entry) => entry.hypothesis.id))
  const existingStage4Ids = new Set(cache.stage4ResolvedWindows.map((window) => window.id))
  const existingStage2Ids = new Set(cache.stage2AcceptedHypotheses.map((hyp) => hyp.id))

  const added3 = promote3.filter((entry) => !existingStage3Ids.has(entry.hypothesis.id))
  const added4 = promote4.filter((window) => !existingStage4Ids.has(window.id))
  const addedStage2 = added3
    .map((entry) => entry.hypothesis)
    .filter((hyp) => !existingStage2Ids.has(hyp.id))

  const stage3Accepted = [...cache.stage3Accepted, ...added3]
  const stage2AcceptedHypotheses = [...cache.stage2AcceptedHypotheses, ...addedStage2]
  const stage4ResolvedWindows = [...cache.stage4ResolvedWindows, ...added4]

  return {
    ...cache,
    stage2AcceptedHypotheses,
    stage3Accepted,
    stage3AcceptedHypotheses: stage3Accepted.map((entry) => entry.hypothesis),
    stage3AcceptedDoorframes: keepDoorframes3,
    stage4ResolvedWindows,
    stage4ResolvedDoorframes: keepDoorframes4,
    stage3AcceptedByFraming: stage3Accepted.filter((entry) => entry.evidence === 'framing').length,
    stage3AcceptedByStripStack: stage3Accepted.filter((entry) => entry.evidence === 'strip_stack')
      .length,
    stage3DoorframeAcceptedCount: keepDoorframes3.length,
  }
}
