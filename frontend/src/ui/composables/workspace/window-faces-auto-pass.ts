import {
  claimFacesInRoomRasterCache,
  createRoomRasterCache,
  syncDoorframeFaceOverrides,
  syncWindowFaceOverrides,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import {
  collectDoorframeClassFaceIds,
  collectWindowClassFaceIds,
  normalizeWindowState,
  type WindowAxelStageCache,
} from './window-faces-helpers'
import type { WindowAxelStage } from '@/cv/windows'

export interface WindowAutoPassState {
  autoPassApplied: boolean
  forceApplyOnNextPass: boolean
  lastAutoWindowFaceIds: number[]
  lastAutoDoorframeFaceIds: number[]
  appliedDoorArcSig: string
}

export function createWindowAutoPassState(): WindowAutoPassState {
  return {
    autoPassApplied: false,
    forceApplyOnNextPass: false,
    lastAutoWindowFaceIds: [],
    lastAutoDoorframeFaceIds: [],
    appliedDoorArcSig: '',
  }
}

export function shouldApplyAutoWindowPass(state: WindowAutoPassState): boolean {
  return !state.autoPassApplied || state.forceApplyOnNextPass
}

export function markWindowAutoPassDone(state: WindowAutoPassState): void {
  state.autoPassApplied = true
  state.forceApplyOnNextPass = false
}

export function invalidateAutoWindowPass(state: WindowAutoPassState): void {
  state.forceApplyOnNextPass = true
  state.autoPassApplied = false
  // Bewaar lastAuto* — anders previousAuto=[] en kan een lege herdetectie
  // geen gerichte remove doen / of juist alles wissen via replace-all-achtig pad.
  state.appliedDoorArcSig = ''
}

function resolveLiveCache(
  roomRasterCache: RoomRasterCache | null,
  wallsOutput: TabDetectionOutputs['walls'],
): RoomRasterCache | null {
  if (roomRasterCache) return roomRasterCache
  const state = wallsOutput?.meta?.roomClassifyState
  if (!state?.labelsData) return null
  const normalized = normalizeWindowState(state)
  if (!normalized) return null
  return createRoomRasterCache(normalized)
}

/**
 * Push Stage-3/4 window + doorframe classes onto the wall raster cache.
 * Beide syncs op één cache; caller commit `next` naar `roomRasterCache` en
 * roept daarna `onWindowFacesApplied` (preview/reattach) — niet hierbinnen,
 * anders tekent preview op een stale cache zonder doorframes.
 */
export async function pushStageClassesOntoWalls(ctx: {
  stageCache: WindowAxelStageCache
  windowAxelStage: WindowAxelStage
  roomRasterCache: RoomRasterCache | null
  wallsOutput: TabDetectionOutputs['walls']
  referenceWallThicknessPx: number | undefined
  autoPassState: WindowAutoPassState
  persistOverrides: (cache: RoomRasterCache) => void
}): Promise<RoomRasterCache | null> {
  const cache = resolveLiveCache(ctx.roomRasterCache, ctx.wallsOutput)
  if (!cache) {
    markWindowAutoPassDone(ctx.autoPassState)
    return null
  }

  const doorframeIds = collectDoorframeClassFaceIds(ctx.stageCache)
  const doorframeSet = new Set(doorframeIds)
  for (const [label, cls] of cache.faceOverrides.entries()) {
    if (cls === 'doorframe' && label > 0) doorframeSet.add(label)
  }
  let windowIds = collectWindowClassFaceIds({
    stage: ctx.windowAxelStage,
    cache: ctx.stageCache,
  }).filter((id) => !doorframeSet.has(id))

  // Lege herdetectie (bv. na door-arc invalidate) mag bestaande window-pins niet wissen.
  if (windowIds.length === 0 && ctx.autoPassState.lastAutoWindowFaceIds.length > 0) {
    windowIds = [...ctx.autoPassState.lastAutoWindowFaceIds]
  }
  let nextDoorframeIds = doorframeIds
  if (nextDoorframeIds.length === 0 && ctx.autoPassState.lastAutoDoorframeFaceIds.length > 0) {
    nextDoorframeIds = [...ctx.autoPassState.lastAutoDoorframeFaceIds]
  }

  const windowSync = syncWindowFaceOverrides(
    cache,
    windowIds,
    ctx.referenceWallThicknessPx,
    ctx.autoPassState.lastAutoWindowFaceIds,
  )
  const windowClaim = claimFacesInRoomRasterCache(cache, windowIds)
  ctx.autoPassState.lastAutoWindowFaceIds = [...new Set(windowIds)]

  const dfSync = syncDoorframeFaceOverrides(
    cache,
    nextDoorframeIds,
    ctx.referenceWallThicknessPx,
    ctx.autoPassState.lastAutoDoorframeFaceIds,
  )
  const dfClaim = claimFacesInRoomRasterCache(cache, nextDoorframeIds)
  ctx.autoPassState.lastAutoDoorframeFaceIds = [...new Set(nextDoorframeIds)]

  const changed =
    windowSync.changed || dfSync.changed || windowClaim.parentMapChanged || dfClaim.parentMapChanged
  if (!changed) return null

  const next: RoomRasterCache = {
    ...cache,
    state: { ...cache.state, parentMap: [...cache.state.parentMap] },
    faceOverrides: new Map(cache.faceOverrides),
    pinnedRoots: new Set(cache.pinnedRoots),
  }
  ctx.persistOverrides(next)
  return next
}
