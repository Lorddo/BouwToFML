import { tally } from '@/core/diagnostics'
import {
  applyFaceClassificationOverrides,
  applyMergedWallChildInheritance,
  isWallMaskClass,
  type RoomRasterClass,
} from './room-ink-classify'
import { resolveMergedLabel } from './room-raster-merge'

/** Classes die permanente FaceID-identiteit verdienen (los uit enclosed parentMap). */
export function isClaimIdentityClass(cls: RoomRasterClass): boolean {
  return cls === 'wall' || cls === 'door' || cls === 'window' || cls === 'doorframe'
}

/**
 * ParentMap-children waarvan de effectieve class wallish is
 * (directe key of via merged root) — kandidaten voor permanente detach.
 */
export function collectWallishParentMapChildren(
  parentMap: Map<number, number>,
  classByLabel: ReadonlyMap<number, RoomRasterClass>,
): number[] {
  const ids: number[] = []
  for (const child of parentMap.keys()) {
    const root = resolveMergedLabel(child, parentMap)
    const cls = classByLabel.get(child) ?? classByLabel.get(root)
    if (cls == null || !isWallMaskClass(cls)) continue
    ids.push(child)
  }
  return ids
}

// ESC:W-04 (A)
/**
 * Vaste volgorde na classify/refine-merge: inherit wallish children →
 * materialiseer class → claim los als individuele roots.
 *
 * - room-first: `faceOverrides: new Map()` → `classificationByLabel` is de
 *   gematerialiseerde class-map; inheritance zit daarin.
 * - refine: bestaande `faceOverrides` → `inheritanceOverrides` is de
 *   effective-override map; claim gebruikt dezelfde gematerialiseerde class.
 */
export function claimWallishAfterInherit(params: {
  classificationByLabel: Map<number, RoomRasterClass>
  parentMap: Map<number, number>
  faceOverrides: Map<number, RoomRasterClass>
}): {
  inheritanceOverrides: Map<number, RoomRasterClass>
  classificationByLabel: Map<number, RoomRasterClass>
  parentMap: Map<number, number>
  detachedFaceIds: number[]
} {
  const inheritanceOverrides = applyMergedWallChildInheritance({
    classificationByLabel: params.classificationByLabel,
    parentMap: params.parentMap,
    faceOverrides: params.faceOverrides,
  })
  const classificationByLabel = applyFaceClassificationOverrides(
    params.classificationByLabel,
    inheritanceOverrides,
  )
  const wallishChildren = collectWallishParentMapChildren(params.parentMap, classificationByLabel)
  const claimed = claimFacesFromParentMap({
    parentMap: params.parentMap,
    faceIds: wallishChildren,
  })
  tally('W-04', claimed.detachedFaceIds.length > 0 ? 'detached' : 'none')
  return {
    inheritanceOverrides,
    classificationByLabel,
    parentMap: claimed.parentMap,
    detachedFaceIds: claimed.detachedFaceIds,
  }
}

/**
 * Claim faces uit enclosed `parentMap`: child → parent entry weg; FaceID = raw label.
 * Geen nieuwe merge/hiërarchie — alleen delete. Idempotent / herclaimbaar.
 *
 * Optioneel `class` (+ `forceClass`) pinnet/overschrijft class op claimed ids
 * (opening-flows die wall-erfenis vervangen).
 */
export function claimFacesFromParentMap(params: {
  parentMap: Map<number, number>
  faceIds: Iterable<number>
  classificationByLabel?: Map<number, RoomRasterClass>
  class?: RoomRasterClass
  /** Default true wanneer `class` gezet is. */
  forceClass?: boolean
}): {
  parentMap: Map<number, number>
  classificationByLabel?: Map<number, RoomRasterClass>
  detachedFaceIds: number[]
  classChangedIds: number[]
} {
  const nextParent = new Map(params.parentMap)
  const detachedFaceIds: number[] = []
  const classChangedIds: number[] = []

  const wantClass = params.class
  const forceClass = params.forceClass ?? wantClass != null
  const nextClass =
    wantClass != null
      ? new Map(params.classificationByLabel ?? [])
      : params.classificationByLabel
        ? new Map(params.classificationByLabel)
        : undefined

  for (const faceId of params.faceIds) {
    if (!(faceId > 0)) continue

    if (nextParent.has(faceId)) {
      const root = resolveMergedLabel(faceId, nextParent)
      nextParent.delete(faceId)
      if (root !== faceId) {
        detachedFaceIds.push(faceId)
      }
    }

    if (wantClass == null || nextClass == null) continue
    const prev = nextClass.get(faceId)
    if (prev === wantClass) continue
    if (prev != null && !forceClass) continue
    nextClass.set(faceId, wantClass)
    classChangedIds.push(faceId)
  }

  return {
    parentMap: nextParent,
    classificationByLabel: nextClass,
    detachedFaceIds,
    classChangedIds,
  }
}
