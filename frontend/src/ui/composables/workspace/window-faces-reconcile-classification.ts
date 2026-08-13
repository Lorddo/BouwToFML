import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { unionFaceBBox } from '@/cv/walls/rooms/face-dual-space'
import { resolveClassAtLabel, type RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import {
  WINDOW_SPACE_POLICY,
  type ResolvedWindowCandidate,
  type WindowAxelOrientation,
} from '@/cv/windows'
import { axisSpan, perpSpan } from '@/cv/windows/window-evidence-geom'

type BBox = { x: number; y: number; width: number; height: number }

function classAt(
  faceId: number,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): RoomRasterClass | undefined {
  return resolveClassAtLabel(faceId, parentMap, classification, undefined)
}

function isWindowFace(
  faceId: number,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): boolean {
  return faceId > 0 && classAt(faceId, classification, parentMap) === 'window'
}

/** Framing-kozijn mag wall blijven; deur/doorframe/unknown horen niet in L14-evidence. */
function keepFramingEvidenceFace(
  faceId: number,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): boolean {
  if (!(faceId > 0)) return false
  const cls = classAt(faceId, classification, parentMap)
  return cls === 'wall' || cls === 'window'
}

function sameIdList(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function centroidFromBBox(bbox: BBox): { x: number; y: number } {
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function scaleCm(lengthPx: number, candidate: ResolvedWindowCandidate): number {
  if (!(candidate.widthPx > 0) || !(candidate.widthCm > 0)) return 0
  return round2(lengthPx * (candidate.widthCm / candidate.widthPx))
}

function collectGlassBBoxes(params: { faceIds: readonly number[]; dual: FaceDualSpace }): BBox[] {
  const out: BBox[] = []
  for (const faceId of params.faceIds) {
    if (!(faceId > 0)) continue
    const bbox = params.dual.geom(faceId, WINDOW_SPACE_POLICY.stage4GlassBBox)?.bbox
    if (bbox) out.push({ ...bbox })
  }
  return out
}

function collectFrameBBoxes(params: { faceIds: readonly number[]; dual: FaceDualSpace }): BBox[] {
  const out: BBox[] = []
  for (const faceId of params.faceIds) {
    if (!(faceId > 0)) continue
    const bbox = params.dual.geom(faceId, WINDOW_SPACE_POLICY.stage4FrameBBox)?.bbox
    if (bbox) out.push({ ...bbox })
  }
  return out
}

/**
 * strip_stack: L14 = max as-span van huidige `window`-strips (langste rail/glas).
 * Geen wall-kozijn — die hoort bij het framing-pad.
 */
function recomputeStripStackGeometry(
  candidate: ResolvedWindowCandidate,
  faceIds: number[],
  evidenceFaceIds: number[],
  measureFaceIds: number[],
  dual: FaceDualSpace,
): ResolvedWindowCandidate {
  const orientation: WindowAxelOrientation = candidate.orientation
  const measureBBoxes = collectGlassBBoxes({ faceIds: measureFaceIds, dual })
  if (measureBBoxes.length <= 0) {
    return {
      ...candidate,
      faceIds,
      evidenceFaceIds,
    }
  }
  const bbox = measureBBoxes.reduce((acc, next) => unionFaceBBox(acc, next))
  const widthPx = Math.max(...measureBBoxes.map((strip) => axisSpan(strip, orientation)))
  const heightPx = perpSpan(bbox, orientation)
  return {
    ...candidate,
    faceIds,
    evidenceFaceIds,
    bbox,
    centroidPx: centroidFromBBox(bbox),
    widthPx: round2(widthPx),
    widthCm: scaleCm(widthPx, candidate),
    heightPx: round2(heightPx),
    heightCm: scaleCm(heightPx, candidate),
  }
}

/**
 * framing-fallback (geen full-strip stack): L14 = glas + wall/window kozijn,
 * zelfde union als Stage-4 `resolveFramingBBox`. Breedte = as-span van de union
 * (niet widest-strip). `door`/`doorframe` evidence is al gestript.
 */
function recomputeFramingGeometry(
  candidate: ResolvedWindowCandidate,
  faceIds: number[],
  evidenceFaceIds: number[],
  dual: FaceDualSpace,
): ResolvedWindowCandidate {
  const orientation: WindowAxelOrientation = candidate.orientation
  const glassBBoxes = collectGlassBBoxes({ faceIds, dual })
  const frameBBoxes = collectFrameBBoxes({ faceIds: evidenceFaceIds, dual })
  const measureBBoxes = [...glassBBoxes, ...frameBBoxes]
  if (measureBBoxes.length <= 0) {
    return {
      ...candidate,
      faceIds,
      evidenceFaceIds,
    }
  }
  const bbox = measureBBoxes.reduce((acc, next) => unionFaceBBox(acc, next))
  const widthPx = axisSpan(bbox, orientation)
  const heightPx = perpSpan(bbox, orientation)
  return {
    ...candidate,
    faceIds,
    evidenceFaceIds,
    bbox,
    centroidPx: centroidFromBBox(bbox),
    widthPx: round2(widthPx),
    widthCm: scaleCm(widthPx, candidate),
    heightPx: round2(heightPx),
    heightCm: scaleCm(heightPx, candidate),
  }
}

/**
 * L14-prep na handmatige face-edit / wees-doorframe→window:
 * demoted faces uit Stage-4; opening-bbox/width herberekenen.
 * Stage 1–4 pipeline blijft onaangeroerd.
 *
 * - strip_stack: faceIds + evidence alleen nog-window; breedte = langste strip
 * - framing: glass = window; evidence mag wall (kozijn) en telt mee in L14-maat
 *   (Stage-4 parity). `door` / `doorframe` / `unknown` evidence wordt gestript.
 */
export function reconcileResolvedWindowForClassification(params: {
  candidate: ResolvedWindowCandidate
  classification: Map<number, RoomRasterClass>
  parentMap?: Map<number, number>
  dual?: FaceDualSpace | null
}): ResolvedWindowCandidate | null {
  const parentMap = params.parentMap ?? new Map<number, number>()
  const { candidate, classification, dual } = params

  const faceIds = candidate.faceIds
    .filter((id) => isWindowFace(id, classification, parentMap))
    .sort((a, b) => a - b)
  const evidenceFaceIds =
    candidate.evidence === 'strip_stack'
      ? candidate.evidenceFaceIds
          .filter((id) => isWindowFace(id, classification, parentMap))
          .sort((a, b) => a - b)
      : candidate.evidenceFaceIds
          .filter((id) => keepFramingEvidenceFace(id, classification, parentMap))
          .sort((a, b) => a - b)

  const measureFaceIds =
    candidate.evidence === 'strip_stack'
      ? [
          ...new Set([
            ...faceIds,
            ...evidenceFaceIds.filter((id) => isWindowFace(id, classification, parentMap)),
          ]),
        ].sort((a, b) => a - b)
      : faceIds

  if (candidate.evidence === 'strip_stack') {
    if (measureFaceIds.length <= 0) return null
  } else if (faceIds.length <= 0) {
    return null
  }

  const idsUnchanged =
    sameIdList(
      faceIds,
      [...candidate.faceIds].sort((a, b) => a - b),
    ) &&
    sameIdList(
      evidenceFaceIds,
      [...candidate.evidenceFaceIds].sort((a, b) => a - b),
    )

  // Framing: ids kunnen “unchanged” zijn terwijl Stage-4 bbox al glas+kozijn is.
  // Alleen herberekenen bij echte id-wijziging (demote / stale DF strip).
  if (idsUnchanged) return candidate

  if (!dual) {
    return {
      ...candidate,
      faceIds,
      evidenceFaceIds,
    }
  }

  if (candidate.evidence === 'framing') {
    return recomputeFramingGeometry(candidate, faceIds, evidenceFaceIds, dual)
  }
  return recomputeStripStackGeometry(candidate, faceIds, evidenceFaceIds, measureFaceIds, dual)
}

/** Batch-reconcile voor L14-bind / demote-prune. */
export function reconcileResolvedWindowsForClassification(params: {
  resolved: readonly ResolvedWindowCandidate[]
  classification: Map<number, RoomRasterClass>
  parentMap?: Map<number, number>
  dual?: FaceDualSpace | null
}): ResolvedWindowCandidate[] {
  const out: ResolvedWindowCandidate[] = []
  for (const candidate of params.resolved) {
    const next = reconcileResolvedWindowForClassification({
      candidate,
      classification: params.classification,
      parentMap: params.parentMap,
      dual: params.dual,
    })
    if (next) out.push(next)
  }
  return out
}

export function resolvedWindowsListChanged(
  before: readonly ResolvedWindowCandidate[],
  after: readonly ResolvedWindowCandidate[],
): boolean {
  if (before.length !== after.length) return true
  for (let i = 0; i < before.length; i += 1) {
    const a = before[i]
    const b = after[i]
    if (a === b) continue
    if (a.id !== b.id) return true
    if (!sameIdList(a.faceIds, b.faceIds)) return true
    if (!sameIdList(a.evidenceFaceIds, b.evidenceFaceIds)) return true
    if (a.widthPx !== b.widthPx) return true
    if (
      a.bbox.x !== b.bbox.x ||
      a.bbox.y !== b.bbox.y ||
      a.bbox.width !== b.bbox.width ||
      a.bbox.height !== b.bbox.height
    ) {
      return true
    }
  }
  return false
}
