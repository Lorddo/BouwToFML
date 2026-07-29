import type { RoomRasterClass } from './room-ink-classify'

/** Minimale cache-shape voor pin/override sync (RoomRasterCache voldoet). */
export interface FaceOverridePinTarget {
  faceOverrides: Map<number, RoomRasterClass>
  pinnedRoots: Set<number>
}

export type SyncPinnedTargetClass = 'door' | 'window' | 'doorframe'

export interface SyncPinnedClassOverridesParams {
  faceIds: Iterable<number>
  targetClass: SyncPinnedTargetClass
  /** Override-classes die mogen verdwijnen als ze niet meer in faceIds zitten. */
  removeClasses: readonly RoomRasterClass[]
  /** Gepinde classes die mogen worden overschreven naar targetClass. */
  upgradeFrom?: readonly RoomRasterClass[]
  /**
   * Alleen deze auto-faces mogen verdwijnen bij her-sync.
   * Ontbreekt → alle removeClasses buiten faceIds verdwijnen.
   */
  previousAutoFaceIds?: Iterable<number>
}

export interface SyncPinnedClassResult {
  changed: boolean
  applied: number
  removed: number
}

/**
 * Eén pin-sync voor Stage-2/3 face-overrides.
 * Handmatige pins buiten `upgradeFrom` worden niet teruggedraaid;
 * remove is previousAuto-only wanneer `previousAutoFaceIds` gezet is.
 */
export function syncPinnedClassOverrides(
  cache: FaceOverridePinTarget,
  params: SyncPinnedClassOverridesParams,
): SyncPinnedClassResult {
  const next = new Set<number>()
  for (const id of params.faceIds) {
    if (id > 0) next.add(id)
  }

  const removable = params.previousAutoFaceIds
    ? new Set([...params.previousAutoFaceIds].filter((id) => id > 0))
    : null

  const removeSet = new Set(params.removeClasses)
  const upgradeSet = new Set(params.upgradeFrom ?? [])
  const { targetClass } = params

  let removed = 0
  for (const [label, cls] of [...cache.faceOverrides.entries()]) {
    if (!removeSet.has(cls)) continue
    if (next.has(label)) continue
    if (removable && !removable.has(label)) continue
    cache.faceOverrides.delete(label)
    cache.pinnedRoots.delete(label)
    removed += 1
  }

  let applied = 0
  for (const label of next) {
    if (cache.faceOverrides.get(label) === targetClass && cache.pinnedRoots.has(label)) continue
    const pinnedCls = cache.faceOverrides.get(label)
    // Handmatige pins blijven; alleen target of upgradeFrom mag worden overschreven.
    if (
      cache.pinnedRoots.has(label) &&
      pinnedCls !== targetClass &&
      (pinnedCls == null || !upgradeSet.has(pinnedCls))
    ) {
      continue
    }
    cache.faceOverrides.set(label, targetClass)
    cache.pinnedRoots.add(label)
    applied += 1
  }

  return { changed: applied > 0 || removed > 0, applied, removed }
}

/**
 * Stage-2 deurfaces → pinned `door`-overrides op de muren-cache.
 * Overschrijft autoclass (incl. foutieve / gepinde `wall` van wall-seed/fill);
 * stale auto-deuren verdwijnen. Pinned → blijven bij Herbereken.
 *
 * `previousAutoFaceIds`: alleen die auto-deurfaces mogen verdwijnen bij her-sync.
 * Handmatige `door`-pins (niet in previous) blijven. Gepinde window/doorframe
 * blijven leidend (niet in upgradeFrom).
 *
 * Geen ink-reresolve hier: tot L11/L12 is `door` class/UI; afronden ziet door als
 * unknown via `toWallPipelineClass`. Ink-topologie blijft wall/unknown/surface.
 */
export function syncDoorSwingFaceOverrides(
  cache: FaceOverridePinTarget,
  doorFaceIds: Iterable<number>,
  _referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return syncPinnedClassOverrides(cache, {
    faceIds: doorFaceIds,
    targetClass: 'door',
    removeClasses: ['door'],
    // Wall-seed Stage-1 (face 254) pin’t vaak al `wall` — moet naar door kunnen.
    upgradeFrom: ['wall', 'unknown', 'surface'],
    previousAutoFaceIds,
  })
}

/**
 * Stage-2 kozijnbrug-faces -> pinned `doorframe`-overrides (donker oranje UI).
 * Muurmasker ziet doorframe via `toWallPipelineClass` als wall (zoals window).
 *
 * Sticky: `doorframe`-pins verdwijnen niet auto (nooit terug naar window).
 * Alleen stale `wall`-bridge-seeds uit previousAuto worden opgeruimd.
 * Handmatige pins op andere classes blijven leidend.
 */
export function syncDoorBridgeWallOverrides(
  cache: FaceOverridePinTarget,
  bridgeFaceIds: Iterable<number>,
  _referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return syncPinnedClassOverrides(cache, {
    faceIds: bridgeFaceIds,
    targetClass: 'doorframe',
    // Alleen wall-seeds opruimen; doorframe blijft sticky.
    removeClasses: ['wall'],
    upgradeFrom: ['wall'],
    previousAutoFaceIds,
  })
}

/**
 * Stage-3 raam-faces -> pinned `window`-overrides (cyaan UI).
 * Muurmasker ziet window via `toWallPipelineClass` als wall.
 *
 * `previousAutoFaceIds`: alleen die auto-ramen mogen verdwijnen bij her-sync.
 * Handmatige pins (niet in previous) blijven. Gepinde non-window
 * (wall/door/doorframe/unknown/surface) worden niet terug naar `window` gezet.
 */
export function syncWindowFaceOverrides(
  cache: FaceOverridePinTarget,
  windowFaceIds: Iterable<number>,
  _referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return syncPinnedClassOverrides(cache, {
    faceIds: windowFaceIds,
    targetClass: 'window',
    removeClasses: ['window'],
    previousAutoFaceIds,
  })
}

/**
 * Stage-3 doorframe-faces -> pinned `doorframe`-overrides (donker oranje UI).
 * Muurmasker ziet doorframe via `toWallPipelineClass` als wall (zoals window).
 *
 * Sticky: geen auto-remove — eens doorframe blijft doorframe tot handmatige override.
 * Upgrade vanaf `window` blijft (Stage-2 door-arc → doorframe).
 */
export function syncDoorframeFaceOverrides(
  cache: FaceOverridePinTarget,
  doorframeFaceIds: Iterable<number>,
  _referenceWallThicknessPx?: number,
  previousAutoFaceIds?: Iterable<number>,
): SyncPinnedClassResult {
  return syncPinnedClassOverrides(cache, {
    faceIds: doorframeFaceIds,
    targetClass: 'doorframe',
    removeClasses: [],
    upgradeFrom: ['window'],
    previousAutoFaceIds,
  })
}
