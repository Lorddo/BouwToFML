import { tally } from '@/core/diagnostics'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { DoorSwingHypothesis } from './types'
import {
  isThinHypBetweenWalls,
  thinHypBBoxesOverlap,
  type ThinMaskBetweenWallsContext,
} from './door-thin-mask-between-walls'
import {
  buildBaselineWallMaskWithoutDoors,
  isThinHypWingBridge,
  paintFaceIdsOntoWallMask,
  type WingBridgeMaskContext,
} from './door-thin-mask-wing-bridge'
import { isThinHypPolylineKeep, type PolylineKeepContext } from './door-thin-mask-polyline-keep'

/** Diepte-proxy loodrecht op de lange as (H-muur ≈ height, V-muur ≈ width). */
export function doorHypothesisDepthPx(bbox: { width: number; height: number }): number {
  return Math.max(1, Math.min(bbox.width, bbox.height))
}

/** Dun genoeg t.o.v. max muur-ref → kandidaat voor mask-keep (nog andere guards). */
export function isDoorHypothesisEligibleForMask(
  depthPx: number,
  referenceWallThicknessPx: number | null | undefined,
): boolean {
  const ref = Math.max(0, referenceWallThicknessPx ?? 0)
  if (!(ref > 0)) return false
  return depthPx <= ref
}

export type DoorHypForThinMask = {
  faceIds: readonly number[]
  /** x/y nodig voor between-walls / overlap; ontbreekt → BW-gate faalt. */
  unionBBox: { x?: number; y?: number; width: number; height: number }
  /** D-62 / bridge / window-sticky: sibling kozijn → blad mag niet in mask. */
  doorframeFaceIds?: readonly number[]
}

/**
 * D-62-swing (of andere hyp met gekoppeld kozijn): sibling = doorframe.
 * Die bladen niet in maskKeep — anders “pair gelukt, blad toch in masker”.
 */
export function isDoorHypothesisSwingWithFrame(hyp: DoorHypForThinMask): boolean {
  return (hyp.doorframeFaceIds?.length ?? 0) > 0
}

/**
 * Hyp met face die nog `window`/`doorframe` is (raam-pad / sticky DF in faceIds)
 * → nooit maskKeep.
 */
export function doorHypothesisHasWindowOrDoorframeFace(
  hyp: DoorHypForThinMask,
  classForFaceId?: (faceId: number) => RoomRasterClass | null | undefined,
): boolean {
  if (!classForFaceId) return false
  for (const faceId of hyp.faceIds) {
    if (faceId <= 0) continue
    const cls = classForFaceId(faceId)
    if (cls === 'window' || cls === 'doorframe') return true
  }
  return false
}

function hypHasFullBBox(
  bbox: DoorHypForThinMask['unionBBox'],
): bbox is { x: number; y: number; width: number; height: number } {
  return (
    typeof bbox.x === 'number' &&
    typeof bbox.y === 'number' &&
    Number.isFinite(bbox.x) &&
    Number.isFinite(bbox.y)
  )
}

type ThinMaskCandidate = {
  hyp: DoorHypForThinMask
  faceIds: number[]
  depth: number
  area: number
  bbox: { x: number; y: number; width: number; height: number }
}

/**
 * Pair-conflict / som-dikte: overlappende L1-kandidaten → hoogstens één.
 * Voorkeur: dunnere depth (past als kozijn in de muur) → kleinere area → lagere faceId.
 */
function pickNonOverlappingByDepth(candidates: readonly ThinMaskCandidate[]): ThinMaskCandidate[] {
  const ranked = [...candidates].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth
    if (a.area !== b.area) return a.area - b.area
    const aId = Math.min(...a.faceIds, Number.MAX_SAFE_INTEGER)
    const bId = Math.min(...b.faceIds, Number.MAX_SAFE_INTEGER)
    return aId - bId
  })
  const kept: ThinMaskCandidate[] = []
  for (const c of ranked) {
    if (kept.some((k) => thinHypBBoxesOverlap(k.bbox, c.bbox))) {
      tally('D-63', 'skip_overlap_pair_conflict')
      continue
    }
    kept.push(c)
  }
  return kept
}

function fallbackHypBBox(hyp: DoorHypForThinMask): {
  x: number
  y: number
  width: number
  height: number
} {
  return hypHasFullBBox(hyp.unionBBox)
    ? hyp.unionBBox
    : {
        x: 0,
        y: 0,
        width: hyp.unionBBox.width,
        height: hyp.unionBBox.height,
      }
}

function componentBBoxForFace(
  faceId: number,
  options: CollectThinDoorMaskOptions | undefined,
): { x: number; y: number; width: number; height: number } | null {
  const comps = options?.betweenWalls?.components
  if (!comps || comps.length === 0) return null
  const parentMap = options.betweenWalls?.parentMap
  const root = parentMap ? resolveMergedLabel(faceId, parentMap) : faceId
  const keys = root > 0 && root !== faceId ? [faceId, root] : [faceId]
  for (const key of keys) {
    const c = comps.find((item) => item.label === key)
    if (c && hypHasFullBBox(c.bbox)) return c.bbox
  }
  return null
}

/**
 * Eigen face-bbox uit raster-components. Zonder component-index: hyp-bbox
 * (tests / single-face). Face ontbreekt in een aanwezige index → fail-closed.
 */
function resolveThinMaskFaceBBox(
  faceId: number,
  hyp: DoorHypForThinMask,
  options: CollectThinDoorMaskOptions | undefined,
): { x: number; y: number; width: number; height: number } | null {
  const fromComp = componentBBoxForFace(faceId, options)
  if (fromComp) return fromComp
  if ((options?.betweenWalls?.components?.length ?? 0) > 0) return null
  return fallbackHypBBox(hyp)
}

function toCandidate(
  hyp: DoorHypForThinMask,
  faceIds: number[],
  bbox: { x: number; y: number; width: number; height: number },
): ThinMaskCandidate | null {
  if (faceIds.length === 0) return null
  return {
    hyp,
    faceIds,
    depth: doorHypothesisDepthPx(bbox),
    area: Math.max(1, bbox.width * bbox.height),
    bbox,
  }
}

function passesLayer1BetweenWalls(
  faceIds: readonly number[],
  bbox: { x: number; y: number; width: number; height: number },
  options: CollectThinDoorMaskOptions | undefined,
): boolean {
  if (options?.assumeBetweenWalls) return true
  if (options?.assumeBetweenWalls === false) return false
  if (!options?.betweenWalls) {
    // Geen geom-context → tests zonder BW: treat as L1-pass
    return true
  }
  if (!hypHasFullBBox(bbox)) {
    tally('D-63', 'skip_not_between_walls')
    return false
  }
  return isThinHypBetweenWalls({ faceIds, unionBBox: bbox }, options.betweenWalls)
}

export type CollectThinDoorMaskOptions = {
  classForFaceId?: (faceId: number) => RoomRasterClass | null | undefined
  /** Laag 1 — between-walls. Productie: altijd zetten. */
  betweenWalls?: ThinMaskBetweenWallsContext
  /**
   * Laag 2 — vleugel-brug dry-run. Alleen voor hyps die L1 niet haalden.
   * Zelfde raster-bron als betweenWalls (labels/class).
   */
  wingBridge?: WingBridgeMaskContext
  /**
   * Laag 3 — polylijn-meetlint (één L1-trace). Alleen wat 1+2 niet keepen.
   * Segments = skelet zonder kandidaat-deuren.
   */
  polylineKeep?: PolylineKeepContext
  /** Tests: forceer BW-ja zonder raster. */
  assumeBetweenWalls?: boolean
}

/**
 * FaceIds van Stage-2 hyps met depth ≤ max muur-ref → mask-keep.
 *
 * Keep is **per face** (eigen bbox + L1/L2/L3). Cluster kozijn+swing in één hyp
 * → alleen het kozijn. Hyp zelf blijft één deur (geen demote/split).
 *
 * Volgorde:
 * 1. Laag 1 per face (between-walls)
 * 2. Pair-conflict / som-dikte: overlappende L1 → één (dunnere)
 * 3. Laag 2 (vleugel-brug) alleen voor anders gedropte thin faces
 * 4. Laag 3 (polylijn in-band/bridge) alleen voor wat 1+2 niet durven
 */
// ESC:D-63 (A) — thin→mask guard
export function collectThinDoorMaskFaceIds(
  hypotheses: readonly DoorHypForThinMask[],
  referenceWallThicknessPx: number | null | undefined,
  options?: CollectThinDoorMaskOptions,
): number[] {
  const ref = Math.max(0, referenceWallThicknessPx ?? 0)
  if (!(ref > 0) || hypotheses.length <= 0) return []

  const blockedFaceIds = new Set<number>()
  for (const hyp of hypotheses) {
    for (const id of hyp.doorframeFaceIds ?? []) {
      if (id > 0) blockedFaceIds.add(id)
    }
  }

  type Eligible = {
    hyp: DoorHypForThinMask
    faceIds: number[]
    bbox: { x: number; y: number; width: number; height: number }
  }
  const eligible: Eligible[] = []

  for (const hyp of hypotheses) {
    if (isDoorHypothesisSwingWithFrame(hyp)) {
      tally('D-63', 'skip_swing_with_frame')
      continue
    }
    for (const faceId of hyp.faceIds) {
      if (faceId <= 0 || blockedFaceIds.has(faceId)) continue
      const cls = options?.classForFaceId?.(faceId)
      if (cls === 'window' || cls === 'doorframe') {
        tally('D-63', 'skip_window_or_doorframe_face')
        continue
      }
      const bbox = resolveThinMaskFaceBBox(faceId, hyp, options)
      if (!bbox) continue
      if (!isDoorHypothesisEligibleForMask(doorHypothesisDepthPx(bbox), ref)) continue
      eligible.push({ hyp, faceIds: [faceId], bbox })
    }
  }

  // --- Laag 1: between-walls ---
  const layer1Raw: ThinMaskCandidate[] = []
  const failedLayer1: Eligible[] = []
  for (const e of eligible) {
    if (passesLayer1BetweenWalls(e.faceIds, e.bbox, options)) {
      const c = toCandidate(e.hyp, e.faceIds, e.bbox)
      if (c) layer1Raw.push(c)
    } else {
      failedLayer1.push(e)
    }
  }

  // --- Pair-conflict / som-dikte (alleen als L1-gate actief) ---
  const applyOverlap = Boolean(options?.betweenWalls) || Boolean(options?.assumeBetweenWalls)
  const layer1Selected = applyOverlap ? pickNonOverlappingByDepth(layer1Raw) : layer1Raw

  // L1 die overlap verloren → ook L2-kandidaat
  if (applyOverlap) {
    const selectedKeys = new Set(
      layer1Selected.map((c) =>
        c.faceIds
          .slice()
          .sort((a, b) => a - b)
          .join(','),
      ),
    )
    for (const c of layer1Raw) {
      const key = c.faceIds
        .slice()
        .sort((a, b) => a - b)
        .join(',')
      if (!selectedKeys.has(key)) {
        failedLayer1.push({ hyp: c.hyp, faceIds: c.faceIds, bbox: c.bbox })
      }
    }
  }

  const keptFaceIds = new Set<number>()
  const keptBBoxes: Array<{ x: number; y: number; width: number; height: number }> = []
  for (const c of layer1Selected) {
    tally('D-63', 'thin_hyp_mask_keep')
    for (const id of c.faceIds) keptFaceIds.add(id)
    keptBBoxes.push(c.bbox)
  }

  // --- Laag 2: vleugel-brug voor anders gedropte ---
  if (options?.wingBridge && failedLayer1.length > 0) {
    const wb = options.wingBridge
    const workingMask = buildBaselineWallMaskWithoutDoors(wb)
    if (keptFaceIds.size > 0) {
      paintFaceIdsOntoWallMask({
        mask: workingMask,
        faceIds: [...keptFaceIds],
        labelsData: wb.labelsData,
        width: wb.width,
        height: wb.height,
        parentMap: wb.parentMap,
      })
    }

    const layer2Raw: ThinMaskCandidate[] = []
    for (const e of failedLayer1) {
      if (e.faceIds.some((id) => keptFaceIds.has(id))) continue
      const c = toCandidate(e.hyp, e.faceIds, e.bbox)
      if (!c) continue
      if (keptBBoxes.some((b) => thinHypBBoxesOverlap(b, c.bbox))) {
        tally('D-63', 'wing_bridge_skip_overlap_l1')
        continue
      }
      if (
        !isThinHypWingBridge({
          baselineMask: workingMask,
          faceIds: e.faceIds,
          labelsData: wb.labelsData,
          width: wb.width,
          height: wb.height,
          parentMap: wb.parentMap,
          referenceWallThicknessPx: wb.referenceWallThicknessPx || ref,
        })
      ) {
        continue
      }
      layer2Raw.push(c)
    }

    const layer2Selected = pickNonOverlappingByDepth(layer2Raw)
    for (const c of layer2Selected) {
      tally('D-63', 'thin_hyp_mask_keep_wing')
      for (const id of c.faceIds) keptFaceIds.add(id)
      keptBBoxes.push(c.bbox)
      paintFaceIdsOntoWallMask({
        mask: workingMask,
        faceIds: c.faceIds,
        labelsData: wb.labelsData,
        width: wb.width,
        height: wb.height,
        parentMap: wb.parentMap,
      })
    }
  }

  // --- Laag 3: polylijn pakt kozijn (in-band / I-bridge), niet swing ---
  if (options?.polylineKeep && options.polylineKeep.segments.length > 0) {
    const pk = options.polylineKeep
    const stillFailed: Eligible[] = []
    for (const e of eligible) {
      if (e.faceIds.some((id) => keptFaceIds.has(id))) continue
      stillFailed.push(e)
    }
    // Ook L1-overlap-verliezers / L2-fails zitten in eligible minus kept
    const layer3Raw: ThinMaskCandidate[] = []
    for (const e of stillFailed) {
      const c = toCandidate(e.hyp, e.faceIds, e.bbox)
      if (!c || !hypHasFullBBox(e.bbox)) continue
      if (keptBBoxes.some((b) => thinHypBBoxesOverlap(b, c.bbox))) {
        tally('D-63', 'polyline_skip_overlap_kept')
        continue
      }
      if (!isThinHypPolylineKeep({ faceIds: e.faceIds, unionBBox: e.bbox }, pk)) {
        continue
      }
      layer3Raw.push(c)
    }
    const layer3Selected = pickNonOverlappingByDepth(layer3Raw)
    for (const c of layer3Selected) {
      tally('D-63', 'thin_hyp_mask_keep_polyline')
      for (const id of c.faceIds) keptFaceIds.add(id)
      keptBBoxes.push(c.bbox)
    }
  }

  return [...keptFaceIds].sort((a, b) => a - b)
}

/** Convenience: DoorSwingHypothesis[] → thin face ids. */
export function collectThinDoorMaskFaceIdsFromHyps(
  hypotheses: readonly DoorSwingHypothesis[],
  referenceWallThicknessPx: number | null | undefined,
  options?: CollectThinDoorMaskOptions,
): number[] {
  return collectThinDoorMaskFaceIds(hypotheses, referenceWallThicknessPx, options)
}

export type { ThinMaskBetweenWallsContext } from './door-thin-mask-between-walls'
export type { WingBridgeMaskContext } from './door-thin-mask-wing-bridge'
export type { PolylineKeepContext } from './door-thin-mask-polyline-keep'
