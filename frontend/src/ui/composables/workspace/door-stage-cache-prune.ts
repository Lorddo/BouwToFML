import { resolveClassAtLabel, type RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { DoorSwingHypothesis, ResolvedDoorCandidate } from '@/cv/doors'
import type { DoorSwingStageCache } from './useWorkspaceDoorSwingHelpers'
import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { reconcileResolvedDoorsForClassification } from './door-faces-reconcile-classification'

function faceStillClassifiedAs(
  faceIds: readonly number[],
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
  want: RoomRasterClass,
): boolean {
  for (const faceId of faceIds) {
    if (!(faceId > 0)) continue
    if (resolveClassAtLabel(faceId, parentMap, classification, undefined) === want) return true
  }
  return false
}

export function doorHypothesisStillClassifiedAsDoor(
  hypothesis: Pick<DoorSwingHypothesis, 'faceIds'>,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): boolean {
  return faceStillClassifiedAs(hypothesis.faceIds, classification, parentMap, 'door')
}

export function resolvedDoorStillClassifiedAsDoor(
  door: Pick<ResolvedDoorCandidate, 'faceIds'>,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): boolean {
  return faceStillClassifiedAs(door.faceIds, classification, parentMap, 'door')
}

/**
 * Na handmatige demote: drop hypotheses zonder class=`door`; resolved strippen tot
 * alleen nog-door faces + alleen nog-doorframe DF-ids (wees-DF→window vallen af).
 * Geen Stage-herdetectie — alleen cache-prune (zelfde contract als windows).
 */
export function pruneDoorStageCacheByClassification<T extends DoorSwingStageCache>(
  cache: T,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
  dual: FaceDualSpace | null = null,
): T {
  const stage1Hypotheses = cache.stage1Hypotheses.filter((hyp) =>
    doorHypothesisStillClassifiedAsDoor(hyp, classification, parentMap),
  )
  const stage2AcceptedHypotheses = cache.stage2AcceptedHypotheses.filter((hyp) =>
    doorHypothesisStillClassifiedAsDoor(hyp, classification, parentMap),
  )
  const resolvedDoors = reconcileResolvedDoorsForClassification({
    resolved: cache.resolvedDoors,
    classification,
    parentMap,
    dual,
  })

  return {
    ...cache,
    stage1Hypotheses,
    stage2AcceptedHypotheses,
    resolvedDoors,
    // Counts: behoud reject-stats; accepted mirrors pruned stage2.
    singleCount: stage2AcceptedHypotheses.filter((h) => (h.faceIds?.length ?? 0) <= 1).length,
    clusterCount: stage2AcceptedHypotheses.filter((h) => (h.faceIds?.length ?? 0) > 1).length,
  }
}

/**
 * Doorframe-faces van weggeprunde deuren die niet meer aan een surviving deur hangen.
 * Twin/shared DF blijft behouden zolang één swing nog class=`door` is.
 */
export function collectOrphanedDoorframeFaceIdsAfterDoorPrune(
  before: readonly Pick<ResolvedDoorCandidate, 'id' | 'doorframeFaceIds'>[],
  after: readonly Pick<ResolvedDoorCandidate, 'id' | 'doorframeFaceIds'>[],
): number[] {
  const survivingIds = new Set(after.map((door) => door.id))
  const survivingDoorframes = new Set<number>()
  for (const door of after) {
    for (const id of door.doorframeFaceIds ?? []) {
      if (id > 0) survivingDoorframes.add(id)
    }
  }
  const orphaned = new Set<number>()
  for (const door of before) {
    if (survivingIds.has(door.id)) continue
    for (const id of door.doorframeFaceIds ?? []) {
      if (id > 0 && !survivingDoorframes.has(id)) orphaned.add(id)
    }
  }
  return [...orphaned]
}
