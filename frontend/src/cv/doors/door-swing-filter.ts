import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import type {
  DoorSizeBandPx,
  DoorSwingDiagnosticStatus,
  DoorSwingFilterStats,
  DoorSwingHypothesis,
  DoorSwingRootDiagnostic,
  DoorSwingRefBand,
} from './types'
import {
  DOOR_SWING_TUNING,
  aggregateRootFaces,
  type RefMatch,
  type RootFace,
} from './door-swing-filter-matching'
import { DOOR_SPACE_POLICY } from './door-space-policy'
import { makeHypothesis } from './door-swing-filter-cluster'
import { evaluateSeedForRef } from './door-swing-filter-seed'

const DIAGNOSTIC_STATUS_PRIORITY: Record<DoorSwingDiagnosticStatus, number> = {
  accepted_single: 3,
  accepted_cluster: 3,
  rejected_out_of_band_or_aspect: 2,
  rejected_cluster_no_match: 2,
  rejected_outside_or_wall: 1,
}

/**
 * Stage-1 swing filter. Seed-detach (+ white rebind) hoort bij
 * `prepareOpeningPipeDual` / `opening-seed-detach` — deze entry verwacht al
 * gedetachte `parentMap` / classes (of een test-map zonder enclosed children).
 */
export function runDoorSwingFilter(params: {
  components: RasterRoomComponent[]
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  classificationGroupBy?: 'merged' | 'component'
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  /** Cluster-adjacency — policy: DOOR_SPACE_POLICY.stage1ClusterBridge (= ink). */
  adjacency: Map<number, Set<number>>
  /**
   * Pipeline dual: wall-rescue Either (ink OR white). Zonder dual: alleen ink-geom
   * uit merged components (unit-tests).
   */
  dual?: FaceDualSpace
  aspectToleranceRatio?: number
  maxClusterSize?: number
  /**
   * Alleen deze classes als seed/cluster/absorb (bijv. `['door']` na snapshot-restore).
   * Zonder dit: huidige gedrag (unknown/surface + wall-rescue).
   */
  allowedSeedClasses?: readonly RoomRasterClass[]
}): {
  hypotheses: DoorSwingHypothesis[]
  stats: DoorSwingFilterStats
  diagnostics: DoorSwingRootDiagnostic[]
} {
  assertSpacePolicy('door Stage 1 measure', DOOR_SPACE_POLICY.stage1Measure, 'white')
  assertSpacePolicy('door Stage 1 cluster-bridge', DOOR_SPACE_POLICY.stage1ClusterBridge, 'ink')
  assertSpacePolicy('door wall-rescue merge', DOOR_SPACE_POLICY.wallRescueMeasure, 'ink')
  const aspectToleranceRatio =
    params.aspectToleranceRatio ?? DOOR_SWING_TUNING.defaultAspectToleranceRatio
  const maxClusterSize = Math.max(
    2,
    params.maxClusterSize ?? DOOR_SWING_TUNING.defaultMaxClusterSize,
  )
  const allowedSeedClasses = params.allowedSeedClasses?.length
    ? new Set(params.allowedSeedClasses)
    : undefined
  const classificationGroupBy = params.classificationGroupBy ?? 'component'
  const parentMap = params.parentMap
  const classificationByLabel = params.classificationByLabel
  const rootFaces = aggregateRootFaces({
    components: params.components,
    parentMap,
    classificationByLabel,
    classificationGroupBy,
  })
  const hypotheses: DoorSwingHypothesis[] = []
  const dedupe = new Set<string>()
  const sortedRoots = [...rootFaces.keys()].sort((a, b) => a - b)

  // Ref-prioriteit: grootste referentie-oppervlak eerst. Zo krijgt de grote boog
  // eerst de kans om verspreide strook-faces tot één volledige boog te clusteren,
  // vóór een kleinere referentie diezelfde faces als losse strook wegsnoept.
  const refOrder = params.refBands
    .map((ref, index) => ({ index, areaPx: ref.areaPx }))
    .sort((a, b) => b.areaPx - a.areaPx || a.index - b.index)
    .map((entry) => entry.index)

  // Één diagnostiek-rij per root: bewaar de sterkste uitkomst over alle ref-passes.
  const diagByRoot = new Map<number, DoorSwingRootDiagnostic>()
  const consideredSeeds = new Set<number>()
  const recordDiag = (
    root: number,
    rootFace: RootFace,
    status: DoorSwingDiagnosticStatus,
    match: RefMatch | null,
  ) => {
    const existing = diagByRoot.get(root)
    if (
      existing &&
      DIAGNOSTIC_STATUS_PRIORITY[existing.status] >= DIAGNOSTIC_STATUS_PRIORITY[status]
    ) {
      return
    }
    diagByRoot.set(root, {
      root,
      className: rootFace.className,
      areaPx: rootFace.areaPx,
      bbox: rootFace.bbox,
      status,
      matchedRefIndex: match ? match.matchedRefIndex : null,
      score: match ? match.score : null,
    })
  }

  // Faces die door een GROTERE referentie geclaimd zijn. Een kleinere referentie
  // mag alleen een hypothese opleveren als die minstens één nieuw vlak toevoegt —
  // niet enkel dezelfde faces van de grotere boog opnieuw claimen.
  const claimedByLargerRefs = new Set<number>()
  let serial = 1

  refOrder.forEach((realRefIndex, orderPos) => {
    const ref = params.refBands[realRefIndex]
    if (!ref) return
    const isLargestRef = orderPos === 0
    const scopedRefs = [ref]
    const claimedThisRef = new Set<number>()
    for (const root of sortedRoots) {
      const rootFace = rootFaces.get(root)
      if (!rootFace) continue
      const outcome = evaluateSeedForRef({
        root,
        rootFace,
        dual: params.dual,
        refBands: scopedRefs,
        realRefIndex,
        rootFaces,
        adjacency: params.adjacency,
        classificationByLabel,
        sizeBand: params.sizeBand,
        aspectToleranceRatio,
        maxClusterSize,
        allowedSeedClasses,
      })
      // Na Either kan rootFaces[root] white-geom zijn i.p.v. ink-merge.
      const measureFace = rootFaces.get(root) ?? rootFace
      if (outcome.kind === 'not_seed') {
        recordDiag(root, measureFace, 'rejected_outside_or_wall', null)
        continue
      }
      consideredSeeds.add(root)
      if (outcome.kind === 'rejected_out_of_band') {
        recordDiag(root, measureFace, 'rejected_out_of_band_or_aspect', null)
        continue
      }
      if (outcome.kind === 'rejected_no_match') {
        recordDiag(root, measureFace, 'rejected_cluster_no_match', null)
        continue
      }
      const addsNewFace = outcome.faceIds.some((face) => !claimedByLargerRefs.has(face))
      if (!isLargestRef && !addsNewFace) {
        // Redundant: kleinere ref hergebruikt uitsluitend faces van een grotere
        // boog zonder nieuwe vlakken → niet dezelfde plek dubbel claimen.
        recordDiag(root, measureFace, 'rejected_cluster_no_match', null)
        continue
      }
      // Dedupe op de face-set (+ ref) ongeacht bron: dezelfde deur die zowel via
      // een single (met absorptie) als via clustering dezelfde vlakken oplevert
      // mag niet dubbel verschijnen.
      const key = `${realRefIndex}:${[...outcome.faceIds].sort((a, b) => a - b).join(',')}`
      if (!dedupe.has(key)) {
        dedupe.add(key)
        let filledAreaPx = 0
        for (const faceId of outcome.faceIds) {
          filledAreaPx += rootFaces.get(faceId)?.areaPx ?? 0
        }
        hypotheses.push(
          makeHypothesis({
            source: outcome.source,
            faceIds: outcome.faceIds,
            unionBBox: outcome.union,
            filledAreaPx,
            match: outcome.match,
            serial,
          }),
        )
        serial += 1
        for (const face of outcome.faceIds) claimedThisRef.add(face)
      }
      recordDiag(
        root,
        measureFace,
        outcome.source === 'single' ? 'accepted_single' : 'accepted_cluster',
        outcome.match,
      )
    }
    for (const face of claimedThisRef) claimedByLargerRefs.add(face)
  })

  const diagnostics = [...diagByRoot.values()].sort((a, b) => a.root - b.root)
  const stats: DoorSwingFilterStats = {
    rootCount: rootFaces.size,
    seedCount: consideredSeeds.size,
    singleAccepted: hypotheses.filter((hyp) => hyp.source === 'single').length,
    clusterAccepted: hypotheses.filter((hyp) => hyp.source === 'cluster').length,
    skippedOutsideSeedCount: diagnostics.filter((d) => d.status === 'rejected_outside_or_wall')
      .length,
    skippedOutOfBandCount: diagnostics.filter((d) => d.status === 'rejected_out_of_band_or_aspect')
      .length,
  }

  return { hypotheses, stats, diagnostics }
}
