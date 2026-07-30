import { noteGatesDisabled } from '@/core/diagnostics'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { prepareOpeningPipeDual } from '@/cv/walls/rooms/opening-pipe-dual'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import {
  extractWallInkComponents,
  mergeOpeningWhiteWithWallInk,
} from '@/cv/walls/rooms/opening-white-space'
import { buildLabelAdjacency } from '@/cv/walls/rooms/label-adjacency'
import { attachDoorframesToResolvedDoors } from './door-attach-doorframes'
import { findDoorBridgeWallFaces } from './door-bridge-wall-promote'
import { runDoorFillFilter } from './door-fill-filter'
import { filterRoomSurroundedHypotheses, filterWallUntouchedHypotheses } from './door-room-surround'
import type { DoorRoomSurroundRejection, DoorWallTouchRejection } from './door-room-surround'
import { resolveDoorCandidates } from './door-resolve'
import {
  buildWallRejectedFillCandidates,
  mergeHypothesesForFillStage,
} from './door-swing-fill-stage'
import { runDoorSwingFilter } from './door-swing-filter'
import { runDoorSwingAngleRescue } from './door-swing-angle-rescue'
import type { DoorAngleRescueDiagnostic } from './door-swing-angle-rescue'
import { DOOR_SPACE_POLICY } from './door-space-policy'
import type {
  DoorFillFilterResult,
  DoorSizeBandPx,
  DoorSwingFilterStats,
  DoorSwingHypothesis,
  DoorSwingRefBand,
  DoorSwingRootDiagnostic,
  ResolvedDoorCandidate,
} from './types'

/**
 * Wall-rescue merge → input voor `prepareOpeningPipeDual` (detach + rebind).
 * White parentMap/components + class-map (wall-ink labels als `wall`);
 * ink-space van cache-dual blijft label-bron — geen tweede FaceDualSpace-build.
 */
export type DoorMergedForPipe = {
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  components: RasterRoomComponent[]
}

export function buildDoorMergedForPipe(dual: FaceDualSpace): DoorMergedForPipe {
  assertSpacePolicy('door wall-rescue', DOOR_SPACE_POLICY.wallRescueMeasure, 'ink')
  const parentMap = dual.white.parentMap
  const classificationByLabel = new Map(dual.white.classificationByLabel)
  const ink = dual.space(DOOR_SPACE_POLICY.wallRescueMeasure)
  const wallInk = extractWallInkComponents({
    labelsData: ink.labelsData,
    width: ink.width,
    height: ink.height,
    classificationByLabel: ink.classificationByLabel,
    parentMap: ink.parentMap,
  })
  for (const component of wallInk) {
    classificationByLabel.set(component.label, 'wall')
  }
  const components = mergeOpeningWhiteWithWallInk({
    whiteComponents: dual.white.components,
    wallInkComponents: wallInk,
  })
  return { parentMap, classificationByLabel, components }
}

export type RunDoorStagePipelineParams = {
  /** Floor dual: Stage 1 white; rescue/resolve ink. */
  dual: FaceDualSpace
  cv: OpenCV
  refBands: DoorSwingRefBand[]
  sizeBand: DoorSizeBandPx
  classificationGroupBy?: 'merged' | 'component'
  /** Snapshot-restore / demote: alleen bestaande door-faces als seed; geen wall-fill/surround/bridge. Angle-rescue blijft aan voor class=door. */
  existingDoorsOnly?: boolean
  allowedSeedClasses?: readonly RoomRasterClass[]
  referenceWallThicknessPx?: number | null
  pxPerMmX: number
  pxPerMmY: number
  /**
   * Bridge class-map (meestal prior vóór deur-overrides).
   * Default: pipeDual.white.classificationByLabel na detach.
   */
  bridgeClassificationByLabel?: Map<number, RoomRasterClass>
}

export type RunDoorStagePipelineResult = {
  /** Merged opening-wit + wall-ink components (Stage 1 / bridge / surround). */
  components: RasterRoomComponent[]
  /** Pipeline dual na detach (white herbonden; ink ongewijzigd). */
  pipeDual: FaceDualSpace
  detachedParentMap: Map<number, number>
  detachedClassificationByLabel: Map<number, RoomRasterClass>
  adjacency: Map<number, Set<number>>
  stage1Hypotheses: DoorSwingHypothesis[]
  stage1Stats: DoorSwingFilterStats
  stage1Diagnostics: DoorSwingRootDiagnostic[]
  stage2Accepted: DoorSwingHypothesis[]
  stage2RejectedCount: number
  fillResult: DoorFillFilterResult
  surroundRejectedCount: number
  surroundRejected: DoorRoomSurroundRejection[]
  /** Stage-2 wall-touch rejects (ná surround + angle-rescue). */
  wallTouchRejectedCount: number
  wallTouchRejected: DoorWallTouchRejection[]
  /** Stage-2 angle-rescue injecties (bypass fill/surround; wall-touch geldt wél). */
  angleRescueCount: number
  angleRescueDiagnostics: DoorAngleRescueDiagnostic[]
  bridgeWallFaceIds: number[]
  resolved: ResolvedDoorCandidate[]
}

/**
 * Stage 1–2 deur pipeline (na ref-band analyse): merge wall-rescue →
 * `prepareOpeningPipeDual` → filter → fill → surround → angle-rescue →
 * wall-touch → bridge → resolve.
 * Pure CV, geen Vue.
 *
 * Verplicht `dual: FaceDualSpace`. Bootstrap: seed-detach + white rebind
 * (`pipeDual`); cluster-adjacency blijft hierna (ink labels + detached parentMap).
 */
export function runDoorStagePipeline(
  params: RunDoorStagePipelineParams,
): RunDoorStagePipelineResult {
  assertSpacePolicy('door Stage 1 cluster-bridge', DOOR_SPACE_POLICY.stage1ClusterBridge, 'ink')
  assertSpacePolicy('door surround', DOOR_SPACE_POLICY.surroundLabels, 'ink')
  assertSpacePolicy('door wall-touch', DOOR_SPACE_POLICY.wallTouchLabels, 'ink')
  assertSpacePolicy('door bridge', DOOR_SPACE_POLICY.bridgeBetweenWalls, 'ink')
  assertSpacePolicy('door resolve', DOOR_SPACE_POLICY.resolvePaint, 'ink')
  assertSpacePolicy('door wall-fill', DOOR_SPACE_POLICY.wallFillMeasure, 'ink')

  const { dual } = params
  const existingDoorsOnly = params.existingDoorsOnly === true
  if (existingDoorsOnly) {
    noteGatesDisabled('D-61', 'runDoorStagePipeline', [
      'wall-fill',
      'room-surround',
      'wall-touch',
      'bridge-promote',
    ])
  }
  const classificationGroupBy = params.classificationGroupBy ?? 'component'
  const merged = buildDoorMergedForPipe(dual)

  const {
    pipeDual,
    detachedParentMap,
    classificationByLabel: detachedClassificationByLabel,
  } = prepareOpeningPipeDual(dual, merged)
  // Bridge “raakt deur”: white adjacency. Stage-1 cluster: ink labels + detached
  // parentMap (wit–inkt–wit; white CC’s raken elkaar nooit direct).
  const whiteAdjacency = pipeDual.white.adjacency
  const clusterAdjacency = buildLabelAdjacency({
    labelsData: pipeDual.ink.labelsData,
    width: pipeDual.ink.width,
    height: pipeDual.ink.height,
    parentMap: detachedParentMap,
  })

  const filtered = runDoorSwingFilter({
    components: merged.components,
    parentMap: detachedParentMap,
    classificationByLabel: detachedClassificationByLabel,
    classificationGroupBy,
    refBands: params.refBands,
    sizeBand: params.sizeBand,
    adjacency: clusterAdjacency,
    dual: pipeDual,
    ...(params.allowedSeedClasses?.length
      ? { allowedSeedClasses: params.allowedSeedClasses }
      : existingDoorsOnly
        ? { allowedSeedClasses: ['door'] as const }
        : {}),
  })

  // ESC:D-61 (D)
  const wallFillCandidates = existingDoorsOnly
    ? []
    : buildWallRejectedFillCandidates({
        diagnostics: filtered.diagnostics,
        refBands: params.refBands,
        sizeBand: params.sizeBand,
      })
  const fillResult = runDoorFillFilter({
    hypotheses: mergeHypothesesForFillStage({
      stage1Hypotheses: filtered.hypotheses,
      wallFillCandidates,
    }),
    refBands: params.refBands,
  })

  // ESC:D-61 (D)
  const surroundFiltered = existingDoorsOnly
    ? { kept: fillResult.accepted, rejected: [] as DoorRoomSurroundRejection[] }
    : filterRoomSurroundedHypotheses({
        hypotheses: fillResult.accepted,
        adjacency: clusterAdjacency,
        parentMap: detachedParentMap,
        classificationByLabel: detachedClassificationByLabel,
      })

  const claimedFaceIds = new Set<number>()
  for (const hyp of surroundFiltered.kept) {
    for (const faceId of hyp.faceIds) claimedFaceIds.add(faceId)
  }
  // existingDoorsOnly: géén unknown→deur via angle-rescue, wél reeds class=door
  // (twins die alleen via angle-rescue in Stage-1 zaten — face 32 / 360/361).
  const angleRescue = runDoorSwingAngleRescue({
    cv: params.cv,
    dual: pipeDual,
    parentMap: detachedParentMap,
    refBands: params.refBands,
    sizeBand: params.sizeBand,
    claimedFaceIds,
    ...(existingDoorsOnly
      ? {
          classificationByLabel: detachedClassificationByLabel,
          allowedClasses: ['door'] as const,
        }
      : {}),
  })

  const stage2BeforeWallTouch = [...surroundFiltered.kept, ...angleRescue.accepted]
  // ESC:D-61 (D)
  const wallTouchFiltered = existingDoorsOnly
    ? { kept: stage2BeforeWallTouch, rejected: [] as DoorWallTouchRejection[] }
    : filterWallUntouchedHypotheses({
        hypotheses: stage2BeforeWallTouch,
        adjacency: clusterAdjacency,
        parentMap: detachedParentMap,
        classificationByLabel: detachedClassificationByLabel,
      })
  const stage2Accepted = wallTouchFiltered.kept
  const stage2RejectedCount =
    fillResult.rejected.length +
    surroundFiltered.rejected.length +
    wallTouchFiltered.rejected.length

  const bridgeClassification = params.bridgeClassificationByLabel ?? detachedClassificationByLabel
  // ESC:D-61 (D)
  const bridgeResult = existingDoorsOnly
    ? { allFaceIds: [] as number[], byHypothesisId: new Map<string, number[]>() }
    : findDoorBridgeWallFaces({
        hypotheses: stage2Accepted,
        components: merged.components,
        labelsData: pipeDual.ink.labelsData,
        width: pipeDual.ink.width,
        height: pipeDual.ink.height,
        parentMap: detachedParentMap,
        classificationByLabel: bridgeClassification,
        classificationGroupBy,
        adjacency: whiteAdjacency,
        referenceWallThicknessPx: params.referenceWallThicknessPx ?? undefined,
      })
  const bridgeWallFaceIds = bridgeResult.allFaceIds

  const stage2WithDoorframes = stage2Accepted.map((hyp) => {
    const ids = bridgeResult.byHypothesisId.get(hyp.id)
    if (!ids || ids.length <= 0) return hyp
    return { ...hyp, doorframeFaceIds: ids }
  })

  const resolvedRaw = resolveDoorCandidates({
    hypotheses: stage2WithDoorframes,
    refBands: params.refBands,
    pxPerMmX: params.pxPerMmX,
    pxPerMmY: params.pxPerMmY,
  })
  // ESC:D-42 (D)
  // Sticky window/bridge doorframes → doorframeFaceIds (ook als Stage 2 geen promote deed).
  const resolved = attachDoorframesToResolvedDoors({
    doors: resolvedRaw,
    labelsData: pipeDual.ink.labelsData,
    width: pipeDual.ink.width,
    height: pipeDual.ink.height,
    parentMap: detachedParentMap,
    classificationByLabel: bridgeClassification,
    referenceWallThicknessPx: params.referenceWallThicknessPx ?? undefined,
  })

  return {
    components: merged.components,
    pipeDual,
    detachedParentMap,
    detachedClassificationByLabel,
    adjacency: clusterAdjacency,
    stage1Hypotheses: filtered.hypotheses,
    stage1Stats: filtered.stats,
    stage1Diagnostics: filtered.diagnostics,
    stage2Accepted: stage2WithDoorframes,
    stage2RejectedCount,
    fillResult,
    surroundRejectedCount: surroundFiltered.rejected.length,
    surroundRejected: surroundFiltered.rejected,
    wallTouchRejectedCount: wallTouchFiltered.rejected.length,
    wallTouchRejected: wallTouchFiltered.rejected,
    angleRescueCount: angleRescue.matchedCount,
    angleRescueDiagnostics: angleRescue.diagnostics,
    bridgeWallFaceIds,
    resolved,
  }
}
