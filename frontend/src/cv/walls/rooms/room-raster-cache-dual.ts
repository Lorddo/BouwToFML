import {
  applyFaceClassificationOverrides,
  resolvePixelClassification,
  type RoomClassificationGroupBy,
  type RoomRasterClass,
} from './room-ink-classify'
import type { SerializedRoomClassifyState } from '../strategies/room-first'
import {
  buildFaceDualSpaceFromState,
  type FaceDualSpace,
} from './face-dual-space'
import { claimFacesFromParentMap } from './face-parent-claim'
import {
  buildFaceBBoxIndex,
  rebuildFaceBBoxInk,
  type FaceBBoxIndex,
} from './face-bbox-index'
import type { RoomRasterCache } from './room-raster-cache-types'

export function mapFromEntries<K extends number, V>(entries: Array<[K, V]>): Map<K, V> {
  return new Map(entries)
}

/** Herbruikbare class-lookup voor toggle/box hot-pad (geen Map-rebuild per label). */
export type FaceClassLookup = {
  parentMap: Map<number, number>
  classificationByLabel: Map<number, RoomRasterClass>
  groupBy: RoomClassificationGroupBy
}

export function buildFaceClassLookup(cache: RoomRasterCache): FaceClassLookup {
  return {
    parentMap: mapFromEntries(cache.state.parentMap),
    classificationByLabel: effectiveClassification(cache),
    groupBy: cache.state.classificationGroupBy ?? 'component',
  }
}

export function classificationWithLookup(label: number, lookup: FaceClassLookup): RoomRasterClass {
  return resolvePixelClassification(
    label,
    lookup.parentMap,
    lookup.classificationByLabel,
    lookup.groupBy,
  )
}

export function bumpFaceDualClassEpoch(cache: RoomRasterCache): void {
  cache.faceDualClassEpoch += 1
}

/** Eager white+ink bbox-index (create / state-ingest). */
export function rebuildFaceBBoxIndex(cache: RoomRasterCache): FaceBBoxIndex {
  const { state } = cache
  const index = buildFaceBBoxIndex({
    rawLabelsData: state.rawLabelsData,
    labelsData: state.labelsData,
    width: state.width,
    height: state.height,
  })
  cache.faceBBox = index
  return index
}

export function ensureFaceBBoxIndex(cache: RoomRasterCache): FaceBBoxIndex {
  if (cache.faceBBox) return cache.faceBBox
  return rebuildFaceBBoxIndex(cache)
}

export function rebuildFaceBBoxInkSide(cache: RoomRasterCache): void {
  const index = ensureFaceBBoxIndex(cache)
  cache.faceBBox = rebuildFaceBBoxInk(
    index,
    cache.state.labelsData,
    cache.state.width,
    cache.state.height,
  )
}

export function invalidateFaceDualSpace(cache: RoomRasterCache): void {
  cache.faceDual = null
  cache.faceDualBuiltClassEpoch = -1
  cache.faceDualBuiltRaw = null
  cache.faceDualBuiltInk = null
  bumpFaceDualClassEpoch(cache)
}

/**
 * Permanente claim op wall-cache parentMap (+ optionele class-pin).
 * Geen nieuwe merge — children worden individuele roots. Invalideert faceDual.
 */
export function claimFacesInRoomRasterCache(
  cache: RoomRasterCache,
  faceIds: Iterable<number>,
  options?: {
    class?: RoomRasterClass
    forceClass?: boolean
    /** Default true wanneer `class` gezet is. */
    pin?: boolean
  },
): {
  detachedFaceIds: number[]
  classChanged: boolean
  parentMapChanged: boolean
} {
  const ids = [...faceIds].filter((id) => id > 0)
  if (ids.length === 0) {
    return { detachedFaceIds: [], classChanged: false, parentMapChanged: false }
  }

  const wantClass = options?.class
  const parentMap = mapFromEntries(cache.state.parentMap)
  const childIds = ids.filter((id) => parentMap.has(id))

  // Al-root faces: geen detach-werk / geen dual-invalidate (tenzij class-pin).
  if (childIds.length === 0 && wantClass == null) {
    return { detachedFaceIds: [], classChanged: false, parentMapChanged: false }
  }

  // Detach alleen children; class-optie mag alle ids meenemen (API-contract).
  const claimIds = wantClass != null ? ids : childIds
  const claimed = claimFacesFromParentMap({
    parentMap,
    faceIds: claimIds,
    classificationByLabel:
      wantClass != null ? mapFromEntries(cache.state.classificationByLabel) : undefined,
    class: wantClass,
    forceClass: options?.forceClass,
  })

  const parentMapChanged = childIds.length > 0

  let classChanged = claimed.classChangedIds.length > 0
  if (wantClass != null) {
    const pin = options?.pin ?? true
    for (const faceId of ids) {
      if (pin) {
        if (cache.faceOverrides.get(faceId) !== wantClass) {
          cache.faceOverrides.set(faceId, wantClass)
          classChanged = true
        }
        cache.pinnedRoots.add(faceId)
      }
    }
  }

  if (parentMapChanged || (wantClass != null && claimed.classificationByLabel && classChanged)) {
    cache.state = {
      ...cache.state,
      ...(parentMapChanged ? { parentMap: [...claimed.parentMap.entries()] } : {}),
      ...(wantClass != null && claimed.classificationByLabel && classChanged
        ? { classificationByLabel: [...claimed.classificationByLabel.entries()] }
        : {}),
    }
  }

  if (parentMapChanged || classChanged) {
    invalidateFaceDualSpace(cache)
  }

  return {
    detachedFaceIds: claimed.detachedFaceIds,
    classChanged,
    parentMapChanged,
  }
}

/**
 * Opening-wit + wall-ink dual op cache. Hard-fail zonder rawLabelsData/labelsData.
 * Herbouwt bij label-buffer- of class-epoch change.
 */
export function ensureFaceDualSpace(cache: RoomRasterCache): FaceDualSpace {
  const { state } = cache
  if (!state.rawLabelsData) {
    throw new Error('FaceDualSpace: cache.state.rawLabelsData ontbreekt')
  }
  if (!state.labelsData || state.labelsData.length === 0) {
    throw new Error('FaceDualSpace: cache.state.labelsData ontbreekt')
  }

  const buffersSame =
    Object.is(state.rawLabelsData, cache.faceDualBuiltRaw) &&
    Object.is(state.labelsData, cache.faceDualBuiltInk)
  const epochSame = cache.faceDualBuiltClassEpoch === cache.faceDualClassEpoch

  if (cache.faceDual && buffersSame && epochSame) {
    return cache.faceDual
  }

  const dual = buildFaceDualSpaceFromState(state, {
    classificationByLabel: effectiveClassification(cache),
    faceOverrides: cache.faceOverrides,
  })
  cache.faceDual = dual
  cache.faceDualBuiltClassEpoch = cache.faceDualClassEpoch
  cache.faceDualBuiltRaw = state.rawLabelsData
  cache.faceDualBuiltInk = state.labelsData
  return dual
}

/**
 * Floor dual voor UI/export/probe: cache dual als labels-length match + raw aanwezig,
 * anders state-build. Caller levert de juiste classification (effective / export).
 */
export function resolveFloorDual(params: {
  state: SerializedRoomClassifyState
  cache?: RoomRasterCache | null
  classificationByLabel: Map<number, RoomRasterClass>
  faceOverrides?: Map<number, RoomRasterClass>
}): FaceDualSpace {
  const { state, cache } = params
  if (
    cache &&
    cache.state.labelsData.length === state.labelsData.length &&
    cache.state.rawLabelsData
  ) {
    return ensureFaceDualSpace(cache)
  }
  return buildFaceDualSpaceFromState(state, {
    classificationByLabel: params.classificationByLabel,
    faceOverrides: params.faceOverrides,
  })
}

export function effectiveClassification(cache: RoomRasterCache): Map<number, RoomRasterClass> {
  return applyFaceClassificationOverrides(
    mapFromEntries(cache.state.classificationByLabel),
    cache.faceOverrides,
  )
}

export function resolveFaceLabelAtPixel(cache: RoomRasterCache, x: number, y: number): number | null {
  const { width, height, labelsData } = cache.state
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px < 0 || py < 0 || px >= width || py >= height) return null
  const label = labelsData[py * width + px] ?? 0
  return label > 0 ? label : null
}

export function classificationAtLabel(cache: RoomRasterCache, label: number): RoomRasterClass {
  return classificationWithLookup(label, buildFaceClassLookup(cache))
}
