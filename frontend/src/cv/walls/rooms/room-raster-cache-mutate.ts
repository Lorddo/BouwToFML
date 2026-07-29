import {
  buildEffectiveComponentClassification,
  buildInkEaterLabelClassFromEffective,
  cycleFaceClassification,
  needsInkReresolve,
  type RoomRasterClass,
} from './room-ink-classify'
import { bboxContains } from './room-raster-merge'
import {
  resolveInkBetweenFaces,
  resolveInkBetweenFacesInRegion,
  resolveInkEatRadii,
  resolveWallInkReach,
} from './room-ink-resolve'
import type { InkDiffBounds } from './room-ink-symmetric'
import { isClaimIdentityClass } from './face-parent-claim'
import { unionLabelsBBox } from './face-bbox-index'
import type {
  FaceClassChangeResult,
  RasterBBox,
  RoomRasterCache,
} from './room-raster-cache-types'
import {
  buildFaceClassLookup,
  bumpFaceDualClassEpoch,
  claimFacesInRoomRasterCache,
  classificationWithLookup,
  ensureFaceBBoxIndex,
  invalidateFaceDualSpace,
  mapFromEntries,
  rebuildFaceBBoxInkSide,
} from './room-raster-cache-dual'

function inkRegionMarginPx(referenceWallThicknessPx?: number): number {
  const radii = resolveInkEatRadii(referenceWallThicknessPx)
  const reach = resolveWallInkReach(referenceWallThicknessPx)
  return Math.ceil(radii.wallEatMaxPx * reach.reachBooster + reach.reachBonusPx + 2)
}

function unionComponentBounds(
  cache: RoomRasterCache,
  labels: number[],
  marginPx = 0,
  /** `raw` = face-pixels zonder inkt (voor resolve-regio); `resolved` = inclusief opgegeten inkt (voor paint). */
  source: 'raw' | 'resolved' = 'raw',
): InkDiffBounds | null {
  if (labels.length === 0) return null
  const index = ensureFaceBBoxIndex(cache)
  const parentMap = mapFromEntries(cache.state.parentMap)
  return unionLabelsBBox(index, labels, {
    source: source === 'resolved' ? 'ink' : 'white',
    width: cache.state.width,
    height: cache.state.height,
    marginPx,
    parentMap,
  })
}

function whiteComponentsForInkResolve(cache: RoomRasterCache) {
  return ensureFaceBBoxIndex(cache).white
}

export function reresolveInkInCache(
  cache: RoomRasterCache,
  referenceWallThicknessPx?: number,
): boolean {
  const rawLabelsData = cache.state.rawLabelsData
  if (!rawLabelsData) return false

  const { width, height } = cache.state
  const parentMap = mapFromEntries(cache.state.parentMap)
  const components = whiteComponentsForInkResolve(cache)
  const effective = buildEffectiveComponentClassification({
    components,
    classificationByLabel: mapFromEntries(cache.state.classificationByLabel),
    faceOverrides: cache.faceOverrides,
    priorParentMap: parentMap,
  })

  const resolved = resolveInkBetweenFaces({
    labelsData: rawLabelsData,
    components,
    width,
    height,
    labelClass: buildInkEaterLabelClassFromEffective(components, effective),
    referenceWallThicknessPx,
  })

  cache.state.labelsData = resolved.labelsData
  cache.state.inkResolveStats = {
    assignedPx: resolved.assignedPx,
    unresolvedPx: resolved.unresolvedPx,
  }
  invalidateFaceDualSpace(cache)
  rebuildFaceBBoxInkSide(cache)
  return true
}

function reresolveInkInCacheRegion(
  cache: RoomRasterCache,
  bounds: InkDiffBounds,
  referenceWallThicknessPx?: number,
): boolean {
  const rawLabelsData = cache.state.rawLabelsData
  if (!rawLabelsData) return false

  const { width, height } = cache.state
  const parentMap = mapFromEntries(cache.state.parentMap)
  const components = whiteComponentsForInkResolve(cache)
  const effective = buildEffectiveComponentClassification({
    components,
    classificationByLabel: mapFromEntries(cache.state.classificationByLabel),
    faceOverrides: cache.faceOverrides,
    priorParentMap: parentMap,
  })

  const resolved = resolveInkBetweenFacesInRegion({
    labelsData: rawLabelsData,
    priorLabelsData: cache.state.labelsData,
    width,
    height,
    labelClass: buildInkEaterLabelClassFromEffective(components, effective),
    referenceWallThicknessPx,
    bounds,
  })

  cache.state.labelsData = resolved.labelsData
  cache.state.inkResolveStats = {
    assignedPx: resolved.assignedPx,
    unresolvedPx: resolved.unresolvedPx,
  }
  invalidateFaceDualSpace(cache)
  rebuildFaceBBoxInkSide(cache)
  return true
}

function unionInkBounds(a: InkDiffBounds | null, b: InkDiffBounds | null): InkDiffBounds | null {
  if (!a) return b
  if (!b) return a
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}

/**
 * Past ink-reresolve toe alleen als eater-rol verandert; regionaal i.p.v. full-canvas.
 * Geeft dirty bounds voor preview-paint.
 * `extraPaintLabels`: claim-detach e.d. die ook herkleurd moeten (groupBy merged).
 */
function applyInkAfterClassChanges(
  cache: RoomRasterCache,
  changes: Array<{ label: number; prev: RoomRasterClass; next: RoomRasterClass }>,
  referenceWallThicknessPx?: number,
  extraPaintLabels: number[] = [],
): FaceClassChangeResult {
  const changedLabels = changes.map((c) => c.label)
  const paintLabels =
    extraPaintLabels.length === 0
      ? changedLabels
      : [...new Set([...changedLabels, ...extraPaintLabels.filter((id) => id > 0)])]
  // Class/override changed — dual className stale tot volgende ensure; classify gebruikt dual niet.
  bumpFaceDualClassEpoch(cache)

  const needsResolve = changes.some((c) => needsInkReresolve(c.prev, c.next))
  if (!needsResolve) {
    // Paint over resolved labels (incl. opgegeten inkt) — raw face-bbox mist die pixels.
    return {
      changedLabels,
      dirtyBounds: unionComponentBounds(cache, paintLabels, 0, 'resolved'),
      didInkReresolve: false,
    }
  }

  const margin = inkRegionMarginPx(referenceWallThicknessPx)
  const bounds = unionComponentBounds(cache, paintLabels, margin, 'raw')
  if (!bounds) {
    reresolveInkInCache(cache, referenceWallThicknessPx)
    return { changedLabels, dirtyBounds: null, didInkReresolve: true }
  }

  const ok = reresolveInkInCacheRegion(cache, bounds, referenceWallThicknessPx)
  if (!ok) {
    reresolveInkInCache(cache, referenceWallThicknessPx)
    return { changedLabels, dirtyBounds: null, didInkReresolve: true }
  }
  // Hele resolve-regio + eventueel grotere resolved face (inkt) opnieuw kleuren.
  // Ink-index is al herbouwd in reresolveInkInCacheRegion.
  const paintBounds = unionInkBounds(
    bounds,
    unionComponentBounds(cache, paintLabels, 0, 'resolved'),
  )
  return { changedLabels, dirtyBounds: paintBounds, didInkReresolve: true }
}

export function toggleFaceAtLabel(
  cache: RoomRasterCache,
  label: number,
  referenceWallThicknessPx?: number,
): RoomRasterClass | null {
  const result = toggleFaceAtLabelDetailed(cache, label, referenceWallThicknessPx)
  return result?.next ?? null
}

export function toggleFaceAtLabelDetailed(
  cache: RoomRasterCache,
  label: number,
  referenceWallThicknessPx?: number,
): (FaceClassChangeResult & { next: RoomRasterClass }) | null {
  const lookup = buildFaceClassLookup(cache)
  const current = classificationWithLookup(label, lookup)
  if (current === 'outside') return null

  const next = cycleFaceClassification(current)
  cache.faceOverrides.set(label, next)
  cache.pinnedRoots.add(label)

  let detachedFaceIds: number[] = []
  if (isClaimIdentityClass(next)) {
    detachedFaceIds = claimFacesInRoomRasterCache(cache, [label]).detachedFaceIds
  }

  const change = applyInkAfterClassChanges(
    cache,
    [{ label, prev: current, next }],
    referenceWallThicknessPx,
    detachedFaceIds,
  )
  return { ...change, next }
}

function normalizeRasterBBox(bbox: RasterBBox): RasterBBox {
  const x = bbox.width < 0 ? bbox.x + bbox.width : bbox.x
  const y = bbox.height < 0 ? bbox.y + bbox.height : bbox.y
  return {
    x,
    y,
    width: Math.abs(bbox.width),
    height: Math.abs(bbox.height),
  }
}

/** Labels van vlakken waarvan de bbox volledig in de selectie ligt. */
export function findFaceLabelsFullyInBBox(
  cache: RoomRasterCache,
  bbox: RasterBBox,
  _referenceWallThicknessPx?: number,
): number[] {
  const selection = normalizeRasterBBox(bbox)
  if (selection.width < 1 || selection.height < 1) return []

  const components = ensureFaceBBoxIndex(cache).ink
  const lookup = buildFaceClassLookup(cache)
  const labels: number[] = []
  for (const component of components) {
    if (!bboxContains(selection, component.bbox)) continue
    if (classificationWithLookup(component.label, lookup) === 'outside') continue
    labels.push(component.label)
  }
  return labels
}

export function setFaceClassificationForLabels(
  cache: RoomRasterCache,
  labels: number[],
  target: RoomRasterClass,
  referenceWallThicknessPx?: number,
): FaceClassChangeResult {
  const lookup = buildFaceClassLookup(cache)
  const changes: Array<{ label: number; prev: RoomRasterClass; next: RoomRasterClass }> = []
  for (const label of labels) {
    const prev = classificationWithLookup(label, lookup)
    if (prev === 'outside') continue
    if (prev === target) continue
    cache.faceOverrides.set(label, target)
    cache.pinnedRoots.add(label)
    changes.push({ label, prev, next: target })
  }
  if (changes.length === 0) {
    return { changedLabels: [], dirtyBounds: null, didInkReresolve: false }
  }
  let detachedFaceIds: number[] = []
  if (isClaimIdentityClass(target)) {
    detachedFaceIds = claimFacesInRoomRasterCache(
      cache,
      changes.map((c) => c.label),
    ).detachedFaceIds
  }
  return applyInkAfterClassChanges(
    cache,
    changes,
    referenceWallThicknessPx,
    detachedFaceIds,
  )
}

export function setFacesFullyInBBox(
  cache: RoomRasterCache,
  bbox: RasterBBox,
  target: RoomRasterClass,
  referenceWallThicknessPx?: number,
): number {
  const labels = findFaceLabelsFullyInBBox(cache, bbox, referenceWallThicknessPx)
  return setFaceClassificationForLabels(cache, labels, target, referenceWallThicknessPx)
    .changedLabels.length
}

export function setFacesFullyInBBoxDetailed(
  cache: RoomRasterCache,
  bbox: RasterBBox,
  target: RoomRasterClass,
  referenceWallThicknessPx?: number,
): FaceClassChangeResult {
  const labels = findFaceLabelsFullyInBBox(cache, bbox, referenceWallThicknessPx)
  return setFaceClassificationForLabels(cache, labels, target, referenceWallThicknessPx)
}
