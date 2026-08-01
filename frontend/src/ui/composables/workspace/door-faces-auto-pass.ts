import {
  claimFacesInRoomRasterCache,
  createRoomRasterCache,
  syncDoorBridgeWallOverrides,
  syncDoorSwingFaceOverrides,
  type RoomRasterCache,
} from '@/cv/walls/rooms/room-raster-cache'
import type { DoorSwingHypothesis } from '@/cv/doors'
import { collectAcceptedDoorFaceIds, normalizeDoorSwingState } from './useWorkspaceDoorSwingHelpers'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'

export interface AutoPassState {
  autoPassApplied: boolean
  forceApplyOnNextPass: boolean
  pendingApplyMode: 'replace-all' | 'replace-auto'
  lastAutoDoorFaceIds: number[]
  lastAutoBridgeFaceIds: number[]
}

export function createAutoPassState(): AutoPassState {
  return {
    autoPassApplied: false,
    forceApplyOnNextPass: false,
    pendingApplyMode: 'replace-all',
    lastAutoDoorFaceIds: [],
    lastAutoBridgeFaceIds: [],
  }
}

export function shouldApplyAutoDoorPass(state: AutoPassState): boolean {
  return !state.autoPassApplied || state.forceApplyOnNextPass
}

export function markDoorAutoPassDone(state: AutoPassState): void {
  state.autoPassApplied = true
  state.forceApplyOnNextPass = false
}

// ESC:O-06 (D)
export function invalidateAutoDoorPass(
  state: AutoPassState,
  mode: 'replace-all' | 'replace-auto' = 'replace-all',
): void {
  state.forceApplyOnNextPass = true
  state.pendingApplyMode = mode
  if (mode === 'replace-all') {
    state.autoPassApplied = false
    state.lastAutoDoorFaceIds = []
    state.lastAutoBridgeFaceIds = []
  }
}

export function resetAutoPassState(state: AutoPassState): void {
  state.autoPassApplied = false
  state.forceApplyOnNextPass = false
  state.pendingApplyMode = 'replace-all'
  state.lastAutoDoorFaceIds = []
  state.lastAutoBridgeFaceIds = []
}

function resolvePreviousAutoDoorFaceIds(state: AutoPassState): number[] | undefined {
  if (state.pendingApplyMode === 'replace-all') return undefined
  return state.lastAutoDoorFaceIds
}

function resolvePreviousAutoBridgeFaceIds(state: AutoPassState): number[] | undefined {
  if (state.pendingApplyMode === 'replace-all') return undefined
  return state.lastAutoBridgeFaceIds
}

/**
 * Push Stage-2 accepted door hypotheses as face overrides onto the wall raster cache.
 * Returns the (potentially updated) cache if Vue reactivity trigger is needed, or null if nothing changed.
 *
 * Wall-rescue seeds blijven anders grijs: pin-sync alleen in faceOverrides is niet
 * genoeg wanneer Otsu/dark-bg enclosed parentMap de class via root-erfenis toont.
 * Claim mét `class` breekt parentMap én materialiseert `door`/`doorframe` in
 * `classificationByLabel` zodat preview/probe/window-doorframe de override overleven.
 */
export async function pushStage2DoorsOntoWalls(ctx: {
  accepted: DoorSwingHypothesis[]
  bridgeWallFaceIds: number[]
  roomRasterCache: RoomRasterCache | null
  wallsOutput: TabDetectionOutputs['walls']
  referenceWallThicknessPx: number | undefined
  autoPassState: AutoPassState
  persistOverrides: (cache: RoomRasterCache) => void
  onDoorFacesApplied?: () => void | Promise<void>
}): Promise<RoomRasterCache | null> {
  let cache = ctx.roomRasterCache
  if (!cache) {
    const state = ctx.wallsOutput?.meta?.roomClassifyState
    if (!state?.labelsData) {
      markDoorAutoPassDone(ctx.autoPassState)
      return null
    }
    cache = createRoomRasterCache(normalizeDoorSwingState(state))
  }
  const faceIds = collectAcceptedDoorFaceIds(ctx.accepted)
  const bridgeFaceIds = [...new Set(ctx.bridgeWallFaceIds.filter((id) => id > 0))]
  const previousAutoDoors = resolvePreviousAutoDoorFaceIds(ctx.autoPassState)
  const previousAutoBridges = resolvePreviousAutoBridgeFaceIds(ctx.autoPassState)
  const doorSync = syncDoorSwingFaceOverrides(
    cache,
    faceIds,
    ctx.referenceWallThicknessPx,
    previousAutoDoors,
  )
  const bridgeSync = syncDoorBridgeWallOverrides(
    cache,
    bridgeFaceIds,
    ctx.referenceWallThicknessPx,
    previousAutoBridges,
  )
  // Escaped parentMap + materialiseer class (wall-rescue → door blijft zichtbaar).
  // Nooit sticky doorframe overschrijven (claim forceClass omzeilt sync upgradeFrom).
  const doorIdsSafe = faceIds.filter((id) => cache.faceOverrides.get(id) !== 'doorframe')
  const doorClaim = claimFacesInRoomRasterCache(cache, doorIdsSafe, {
    class: 'door',
    forceClass: true,
  })
  const bridgeClaim = claimFacesInRoomRasterCache(cache, bridgeFaceIds, {
    class: 'doorframe',
    forceClass: true,
  })
  ctx.autoPassState.lastAutoDoorFaceIds = [...new Set(faceIds)]
  ctx.autoPassState.lastAutoBridgeFaceIds = bridgeFaceIds
  markDoorAutoPassDone(ctx.autoPassState)
  ctx.autoPassState.pendingApplyMode = 'replace-auto'
  const claimChanged =
    doorClaim.parentMapChanged ||
    doorClaim.classChanged ||
    bridgeClaim.parentMapChanged ||
    bridgeClaim.classChanged
  if (!doorSync.changed && !bridgeSync.changed && !claimChanged) return null
  const next: RoomRasterCache = {
    ...cache,
    state: {
      ...cache.state,
      parentMap: [...cache.state.parentMap],
      classificationByLabel: [...cache.state.classificationByLabel],
    },
    faceOverrides: new Map(cache.faceOverrides),
    pinnedRoots: new Set(cache.pinnedRoots),
  }
  ctx.persistOverrides(next)
  await ctx.onDoorFacesApplied?.()
  return next
}

/**
 * After purge-snap: sync face overrides for kept door face ids.
 * Returns next cache for Vue-reactivity trigger, or null if unchanged.
 */
export function syncPurgedDoorFaceOverrides(ctx: {
  cache: RoomRasterCache
  purgeKeptFaceIds: number[]
  referenceWallThicknessPx: number | undefined
  autoPassState: AutoPassState
  persistOverrides: (cache: RoomRasterCache) => void
}): RoomRasterCache | null {
  const previousAuto = resolvePreviousAutoDoorFaceIds(ctx.autoPassState)
  const doorSync = syncDoorSwingFaceOverrides(
    ctx.cache,
    ctx.purgeKeptFaceIds,
    ctx.referenceWallThicknessPx,
    previousAuto,
  )
  const doorClaim = claimFacesInRoomRasterCache(ctx.cache, ctx.purgeKeptFaceIds, {
    class: 'door',
    forceClass: true,
  })
  ctx.autoPassState.lastAutoDoorFaceIds = ctx.purgeKeptFaceIds
  if (!doorSync.changed && !doorClaim.parentMapChanged && !doorClaim.classChanged) return null
  const next: RoomRasterCache = {
    ...ctx.cache,
    state: {
      ...ctx.cache.state,
      parentMap: [...ctx.cache.state.parentMap],
      classificationByLabel: [...ctx.cache.state.classificationByLabel],
    },
    faceOverrides: new Map(ctx.cache.faceOverrides),
    pinnedRoots: new Set(ctx.cache.pinnedRoots),
  }
  ctx.persistOverrides(next)
  return next
}
