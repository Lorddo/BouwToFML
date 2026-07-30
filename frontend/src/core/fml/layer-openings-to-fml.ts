import type { OrientedDoor } from '@/cv/doors'
import type { BoundWindow } from '@/cv/windows'
import { isValidOpeningSpanCm, spanWidthCmBetweenPoints } from './extraction-to-plan-geom'
import type { Layer12DoorForFml, Layer14WindowForFml } from './extraction-to-plan-types'

/** Map L12 OrientedDoor → FML DTO; null als span ongeldig. FML-contract = L12 openings, niet L11 BoundDoor. */
export function toLayer12DoorForFml(
  door: OrientedDoor,
  pxPerMmX: number,
  pxPerMmY: number,
): Layer12DoorForFml | null {
  // FML = kozijn-buiten tot kozijn-buiten (niet alleen clear blad).
  if (!Number.isFinite(door.openingStartPx.x) || !Number.isFinite(door.openingStartPx.y))
    return null
  if (!Number.isFinite(door.openingEndPx.x) || !Number.isFinite(door.openingEndPx.y)) return null
  const widthCm = spanWidthCmBetweenPoints(
    door.openingStartPx,
    door.openingEndPx,
    pxPerMmX,
    pxPerMmY,
  )
  // ESC:X-24 (B)
  if (!isValidOpeningSpanCm(widthCm)) return null
  return {
    doorId: door.doorId,
    segmentIndex: door.segmentIndex,
    fmlRefId: door.fmlRefId,
    mirrored: door.mirrored,
    snappedBBox: door.snappedBBox,
    openingStartPx: door.openingStartPx,
    openingEndPx: door.openingEndPx,
    // Boog-inset komt uit opening-refid-catalog (swingInsetCm), niet uit gemeten framing.
  }
}

/** Map L14 BoundWindow → FML DTO; null als span ongeldig. openingBBox blijft op BoundWindow (merge/overlays). */
export function toLayer14WindowForFml(window: BoundWindow): Layer14WindowForFml | null {
  if (!Number.isFinite(window.openingStartPx.x) || !Number.isFinite(window.openingStartPx.y))
    return null
  if (!Number.isFinite(window.openingEndPx.x) || !Number.isFinite(window.openingEndPx.y))
    return null
  if (!isValidOpeningSpanCm(window.widthCm) && !(window.widthPx > 0)) return null
  return {
    windowId: window.windowId,
    segmentIndex: window.segmentIndex,
    fmlRefId: window.fmlRefId,
    openingStartPx: window.openingStartPx,
    openingEndPx: window.openingEndPx,
  }
}
