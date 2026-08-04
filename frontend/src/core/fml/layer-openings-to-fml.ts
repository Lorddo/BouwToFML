import { tally } from '@/core/diagnostics'
import type { OrientedDoor } from '@/cv/doors'
import {
  dedupeOverlappingBoundWindows,
  mergeAdjacentBoundWindows,
  suppressWindowsNearDoors,
  type BoundWindow,
  type WallOpeningSpan,
} from '@/cv/windows'
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
  if (!isValidOpeningSpanCm(widthCm)) {
    tally('X-24', 'door_span_rejected')
    return null
  }
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
  // ESC:X-24 (B)
  if (!isValidOpeningSpanCm(window.widthCm) && !(window.widthPx > 0)) {
    tally('X-24', 'window_span_rejected')
    return null
  }
  return {
    windowId: window.windowId,
    segmentIndex: window.segmentIndex,
    fmlRefId: window.fmlRefId,
    openingStartPx: window.openingStartPx,
    openingEndPx: window.openingEndPx,
  }
}

/**
 * L14 BoundWindows → FML DTO's.
 * Volgorde: 1D muurgat-dedupe (R-28) → deur-suppress (X-28) → pair/triple-merge (R-27).
 * Default `mergeMultiWindows: true`.
 */
export function toLayer14WindowsForFml(
  windows: BoundWindow[],
  options?: { mergeMultiWindows?: boolean; doors?: readonly WallOpeningSpan[] },
): Layer14WindowForFml[] {
  const deduped = dedupeOverlappingBoundWindows(windows)
  const withoutDoorConflict = suppressWindowsNearDoors(deduped, options?.doors ?? [])
  const source = mergeAdjacentBoundWindows(withoutDoorConflict, {
    enabled: options?.mergeMultiWindows !== false,
  })
  return source
    .map((window) => toLayer14WindowForFml(window))
    .filter((window): window is Layer14WindowForFml => !!window)
}
