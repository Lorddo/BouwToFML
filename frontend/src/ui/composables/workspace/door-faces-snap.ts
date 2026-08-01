import { noteSwallowedError, tally } from '@/core/diagnostics'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { waitForOpenCV } from '@/cv/loadOpenCV'
import { formatCvError } from '@/cv/formatCvError'
import { decodeMaskRle } from '@/cv/util/binary-mask-rle'
import { type RoomRasterCache } from '@/cv/walls/rooms/room-raster-cache'
import {
  attachDoorframesToResolvedDoors,
  filterDoorsByKeptWallMaskContact,
  orientBoundDoors,
  snapDoorsToWalls,
  type BoundDoor,
  type OrientedDoor,
  type ResolvedDoorCandidate,
} from '@/cv/doors'
import { normalizeDoorSwingState } from './useWorkspaceDoorSwingHelpers'
import { resolvedDoorStillClassifiedAsDoor } from './door-stage-cache-prune'
import {
  resolveEffectiveWallClassification,
  resolveEffectiveWallParentMap,
} from './faces-effective-classification'

/**
 * Houd alleen resolved deuren waarvan minstens één face nog `door` is.
 * Voorkomt dat stale Stage-2-hits (handmatig teruggezet naar unknown/wall)
 * bij afronden alsnog als L11/L12-symbolen verschijnen.
 */
// ESC:O-20 (B)
export function filterResolvedDoorsStillClassifiedAsDoor(params: {
  resolved: ResolvedDoorCandidate[]
  roomRasterCache: RoomRasterCache | null
  wallsMeta: TabDetectionOutputs['walls'] | null | undefined
}): ResolvedDoorCandidate[] {
  tally('O-20', 'filter_class_door')
  const stateRaw = params.wallsMeta?.meta?.roomClassifyState
  if (!params.roomRasterCache && !stateRaw) return params.resolved
  const classification = resolveEffectiveWallClassification({
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.wallsMeta,
  })
  if (!classification) return params.resolved
  const parentMap = resolveEffectiveWallParentMap({
    roomRasterCache: params.roomRasterCache,
    wallsMeta: params.wallsMeta,
  })
  return params.resolved.filter((door) =>
    resolvedDoorStillClassifiedAsDoor(door, classification, parentMap),
  )
}

/**
 * Zonder Stage-2 her-run: sticky class=`doorframe` (vaak na window-pass) op
 * bestaande resolved → `doorframeFaceIds`. L11 blijft alleen bij finalize.
 * @returns next resolved list, or `null` if unchanged.
 */
// ESC:O-10 (D)
export function reattachStickyDoorframesToResolved(params: {
  resolvedDoors: ResolvedDoorCandidate[]
  walls: TabDetectionOutputs['walls'] | null | undefined
  roomRasterCache: RoomRasterCache | null
  referenceWallThicknessPx?: number
}): ResolvedDoorCandidate[] | null {
  tally('O-10', 'reattach_sticky')
  const stateRaw = params.walls?.meta?.roomClassifyState
  if (!stateRaw?.labelsData || params.resolvedDoors.length <= 0 || !params.walls) return null
  const state = normalizeDoorSwingState(stateRaw)
  const classification =
    resolveEffectiveWallClassification({
      roomRasterCache: params.roomRasterCache,
      wallsMeta: params.walls,
    }) ?? new Map()
  const enriched = attachDoorframesToResolvedDoors({
    doors: params.resolvedDoors,
    labelsData: state.labelsData,
    width: state.width,
    height: state.height,
    parentMap: new Map(state.parentMap),
    classificationByLabel: classification,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  if (enriched === params.resolvedDoors) return null
  const byId = new Map(enriched.map((d) => [d.id, d]))
  let changed = false
  const nextResolved = params.resolvedDoors.map((d) => {
    const hit = byId.get(d.id)
    if (!hit || hit === d) return d
    changed = true
    return hit
  })
  return changed ? nextResolved : null
}

export function collectResolvedDoorFaceIds(doors: ResolvedDoorCandidate[]): number[] {
  const ids = new Set<number>()
  for (const door of doors) {
    for (const faceId of door.faceIds) {
      if (faceId > 0) ids.add(faceId)
    }
  }
  return [...ids]
}

export type SnapResolvedDoorsResult = {
  bound: BoundDoor[]
  oriented: OrientedDoor[]
  /**
   * Apply to stageCache.resolvedDoors when non-null.
   * Set on sticky reattach and/or kept-mask purge — not on class-still alone (1:1 legacy).
   */
  nextResolvedDoors: ResolvedDoorCandidate[] | null
  /** Non-null when kept-mask purge dropped doors — caller syncs face overrides. */
  purgeKeptFaceIds: number[] | null
}

export type SnapResolvedDoorsParams = {
  walls: TabDetectionOutputs['walls'] | null | undefined
  roomRasterCache: RoomRasterCache | null
  resolvedDoors: ResolvedDoorCandidate[]
  referenceWallThicknessPx?: number
  /** White dual parentMap from overlay cache; falls back to ink parentMap. */
  whiteParentMap?: Map<number, number> | null
  setLocalError: (message: string | null) => void
}

/**
 * UI-orchestratie rond L11 `snapDoorsToWalls` + L12 `orientBoundDoors`.
 * Volgorde 1:1: sticky reattach → class-still → kept-mask purge → snap → orient.
 */
export async function snapResolvedDoorsToWalls(
  params: SnapResolvedDoorsParams,
): Promise<SnapResolvedDoorsResult> {
  const empty = (
    nextResolvedDoors: ResolvedDoorCandidate[] | null = null,
  ): SnapResolvedDoorsResult => ({
    bound: [],
    oriented: [],
    nextResolvedDoors,
    purgeKeptFaceIds: null,
  })

  const walls = params.walls
  const stateRaw = walls?.meta?.roomClassifyState
  const maskRle = walls?.roomWallMaskRle
  const segments = walls?.semanticWallGraph?.segments ?? []
  if (!walls || !stateRaw?.labelsData || !maskRle || segments.length <= 0) {
    return empty()
  }
  const state = normalizeDoorSwingState(stateRaw)
  if (state.width !== maskRle.width || state.height !== maskRle.height) {
    return empty()
  }

  const classification =
    resolveEffectiveWallClassification({
      roomRasterCache: params.roomRasterCache,
      wallsMeta: walls,
    }) ?? new Map()
  const parentMap = new Map(state.parentMap)

  // ESC:O-11 (D)
  // Verse sticky pins (window) meenemen vóór Path A.
  tally('O-11', 'pre_path_a_sticky')
  const stickyNext = reattachStickyDoorframesToResolved({
    resolvedDoors: params.resolvedDoors,
    walls,
    roomRasterCache: params.roomRasterCache,
    referenceWallThicknessPx: params.referenceWallThicknessPx,
  })
  const afterSticky = stickyNext ?? params.resolvedDoors
  let nextResolvedDoors: ResolvedDoorCandidate[] | null = stickyNext

  const enriched = filterResolvedDoorsStillClassifiedAsDoor({
    resolved: afterSticky,
    roomRasterCache: params.roomRasterCache,
    wallsMeta: walls,
  })
  if (enriched.length <= 0) {
    return empty(nextResolvedDoors)
  }

  const wallMask = decodeMaskRle(maskRle)
  const thickness = params.referenceWallThicknessPx
  // ESC:O-21 (B)
  // Post-L0: alleen deuren die de kept wall mask raken → L11; orphan auto-doors unpin.
  tally('O-21', 'kept_wall_mask')
  const maskFiltered = filterDoorsByKeptWallMaskContact({
    doors: enriched,
    wallMask,
    labelsData: state.labelsData,
    parentMap,
    width: state.width,
    height: state.height,
    referenceWallThicknessPx: thickness,
  })
  const keptDoors = maskFiltered.kept
  let purgeKeptFaceIds: number[] | null = null
  if (maskFiltered.rejected.length > 0 && keptDoors.length > 0) {
    nextResolvedDoors = keptDoors
    purgeKeptFaceIds = collectResolvedDoorFaceIds(keptDoors)
  } else if (maskFiltered.rejected.length > 0 && keptDoors.length <= 0) {
    // Alle mask-orphans: unpin auto-deuren, maar alleen na finalize (caller heeft mask).
    nextResolvedDoors = keptDoors
    purgeKeptFaceIds = []
  }

  if (keptDoors.length <= 0) {
    return {
      bound: [],
      oriented: [],
      nextResolvedDoors,
      purgeKeptFaceIds,
    }
  }

  const snapped = snapDoorsToWalls({
    doors: keptDoors,
    wallMask,
    width: state.width,
    height: state.height,
    labelsData: state.labelsData,
    parentMap,
    segments,
    referenceWallThicknessPx: thickness,
    classificationByLabel: classification,
  })

  const whiteLabels =
    state.rawLabelsData instanceof Int32Array
      ? state.rawLabelsData
      : state.rawLabelsData
        ? new Int32Array(state.rawLabelsData)
        : state.labelsData
  const whiteParentMap = params.whiteParentMap ?? parentMap

  let oriented: OrientedDoor[]
  try {
    const cv = await waitForOpenCV()
    oriented = orientBoundDoors({
      cv,
      boundDoors: snapped,
      resolvedDoors: keptDoors,
      segments,
      whiteLabelsData: whiteLabels,
      whiteParentMap,
      width: state.width,
      height: state.height,
    })
    // ESC:O-36 (D)
  } catch (error) {
    noteSwallowedError('O-36', 'door-faces-snap.orientBoundDoors', error, {
      boundDoors: snapped.length,
      effect: 'L12 leeg — deuren verdwijnen uit FML',
    })
    oriented = []
    params.setLocalError(formatCvError(error))
  }

  return {
    bound: snapped,
    oriented,
    nextResolvedDoors,
    purgeKeptFaceIds,
  }
}
