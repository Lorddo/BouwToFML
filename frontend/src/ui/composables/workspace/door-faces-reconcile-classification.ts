import type { FaceDualSpace } from '@/cv/walls/rooms/face-dual-space'
import { unionFaceBBox } from '@/cv/walls/rooms/face-dual-space'
import { resolveClassAtLabel, type RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'
import type { ResolvedDoorCandidate } from '@/cv/doors'
import { measureSwingSpanPxFromFaceBBox } from '@/cv/doors/door-swing-hinge'
import { round2 } from '@/cv/doors/door-wall-snap-geom'

type BBox = { x: number; y: number; width: number; height: number }

function classAt(
  faceId: number,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): RoomRasterClass | undefined {
  return resolveClassAtLabel(faceId, parentMap, classification, undefined)
}

function isDoorFace(
  faceId: number,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): boolean {
  return faceId > 0 && classAt(faceId, classification, parentMap) === 'door'
}

function isDoorframeFace(
  faceId: number,
  classification: Map<number, RoomRasterClass>,
  parentMap: Map<number, number>,
): boolean {
  return faceId > 0 && classAt(faceId, classification, parentMap) === 'doorframe'
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

function scaleWidthCm(widthPx: number, door: ResolvedDoorCandidate): number {
  if (!(door.widthPx > 0) || !(door.widthCm > 0)) return door.widthCm
  return round2(widthPx * (door.widthCm / door.widthPx))
}

function collectDoorBBoxes(params: {
  faceIds: readonly number[]
  dual: FaceDualSpace | null | undefined
}): BBox[] {
  if (!params.dual) return []
  const out: BBox[] = []
  for (const faceId of params.faceIds) {
    if (!(faceId > 0)) continue
    // Deurblad: ink-prefer (class paint), white fallback.
    const bbox =
      params.dual.geom(faceId, 'inkThenWhite')?.bbox ?? params.dual.geom(faceId, 'white')?.bbox
    if (bbox) out.push({ ...bbox })
  }
  return out
}

/**
 * L11/L12-prep na handmatige demote / wees-doorframe-promote:
 * - faceIds alleen nog `door`
 * - doorframeFaceIds alleen nog `doorframe` (promoted DF→window vallen af → geen deur-breedte meer)
 * - bbox/swingSpan/width herberekeken uit resterende deurfaces
 */
export function reconcileResolvedDoorForClassification(params: {
  door: ResolvedDoorCandidate
  classification: Map<number, RoomRasterClass>
  parentMap?: Map<number, number>
  dual?: FaceDualSpace | null
}): ResolvedDoorCandidate | null {
  const parentMap = params.parentMap ?? new Map<number, number>()
  const { door, classification, dual } = params

  const faceIds = door.faceIds
    .filter((id) => isDoorFace(id, classification, parentMap))
    .sort((a, b) => a - b)
  if (faceIds.length <= 0) return null

  const prevDf = door.doorframeFaceIds ?? []
  const doorframeFaceIds = prevDf
    .filter((id) => isDoorframeFace(id, classification, parentMap))
    .sort((a, b) => a - b)

  const facesUnchanged = sameIdList(
    faceIds,
    [...door.faceIds].sort((a, b) => a - b),
  )
  const dfUnchanged = sameIdList(
    doorframeFaceIds,
    [...prevDf].sort((a, b) => a - b),
  )
  if (facesUnchanged && dfUnchanged) return door

  const nextBase: ResolvedDoorCandidate = {
    ...door,
    faceIds,
    ...(doorframeFaceIds.length > 0 ? { doorframeFaceIds } : { doorframeFaceIds: undefined }),
  }

  const measureBBoxes = collectDoorBBoxes({ faceIds, dual })
  if (measureBBoxes.length <= 0) {
    // Zonder dual: ids strippen; L11 Path A zonder stale DF is al winst.
    return nextBase
  }

  const bbox = measureBBoxes.reduce((acc, next) => unionFaceBBox(acc, next))
  const swingSpanPx = round2(measureSwingSpanPxFromFaceBBox(bbox))
  // Behoud REF-framing-verhouding t.o.v. oude swingSpan waar mogelijk.
  const spanRatio =
    door.swingSpanPx > 0 && Number.isFinite(door.swingSpanPx) ? swingSpanPx / door.swingSpanPx : 1
  const overhangAlongPx = round2(Math.max(0, door.overhangAlongPx * spanRatio))
  const overhangOppositePx = round2(Math.max(0, door.overhangOppositePx * spanRatio))
  const widthPx = round2(Math.max(1, overhangAlongPx + overhangOppositePx))

  return {
    ...nextBase,
    bbox,
    centroidPx: centroidFromBBox(bbox),
    swingSpanPx,
    overhangAlongPx,
    overhangOppositePx,
    widthPx,
    widthCm: scaleWidthCm(widthPx, door),
  }
}

export function reconcileResolvedDoorsForClassification(params: {
  resolved: readonly ResolvedDoorCandidate[]
  classification: Map<number, RoomRasterClass>
  parentMap?: Map<number, number>
  dual?: FaceDualSpace | null
}): ResolvedDoorCandidate[] {
  const out: ResolvedDoorCandidate[] = []
  for (const door of params.resolved) {
    const next = reconcileResolvedDoorForClassification({
      door,
      classification: params.classification,
      parentMap: params.parentMap,
      dual: params.dual,
    })
    if (next) out.push(next)
  }
  return out
}

export function resolvedDoorsListChanged(
  before: readonly ResolvedDoorCandidate[],
  after: readonly ResolvedDoorCandidate[],
): boolean {
  if (before.length !== after.length) return true
  for (let i = 0; i < before.length; i += 1) {
    const a = before[i]
    const b = after[i]
    if (a === b) continue
    if (a.id !== b.id) return true
    if (!sameIdList(a.faceIds, b.faceIds)) return true
    if (!sameIdList(a.doorframeFaceIds ?? [], b.doorframeFaceIds ?? [])) return true
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
