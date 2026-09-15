import { isReusableUnderlayDrawing } from '@/core/plan/copy-underlay-drawing'
import { drawingFromImageScale } from '@/core/plan/drawing-to-underlay-layout'
import type { DrawingMeta, Floor } from '@/core/plan/types'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import type { FloorWorkspaceBlob, PreviewUnderlayLayout } from './types'

/** Fallback als oude blob nog geen layout had — origin 0; px/mm uit schaal-snapshot. */
export function layoutFromSessionScale(
  scale: DevWorkspaceSession['scale'] | null | undefined,
): PreviewUnderlayLayout | null {
  if (!scale?.confirmed) return null
  const pxPerMmX =
    'confirmedPixelsPerMillimeterX' in scale &&
    typeof scale.confirmedPixelsPerMillimeterX === 'number'
      ? scale.confirmedPixelsPerMillimeterX
      : 0
  const pxPerMmY =
    'confirmedPixelsPerMillimeterY' in scale &&
    typeof scale.confirmedPixelsPerMillimeterY === 'number'
      ? scale.confirmedPixelsPerMillimeterY
      : pxPerMmX
  if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) return null
  return { origin: { x: 0, y: 0 }, pxPerMmX, pxPerMmY }
}

/**
 * Scan + schaal van de converter-blob → `floor.drawing` (data-URL mag:
 * FML-export stript die; editor en `.plg` houden hem).
 */
export function drawingFromWorkspaceBlob(blob: FloorWorkspaceBlob): DrawingMeta | null {
  const session = blob.session
  const url =
    typeof session?.workingImagePng === 'string' && session.workingImagePng.trim().length > 0
      ? session.workingImagePng
      : null
  if (!url || !session) return null
  const width = session.imageWidth
  const height = session.imageHeight
  if (!(width > 0) || !(height > 0)) return null
  const layout = blob.previewUnderlayLayout ?? layoutFromSessionScale(session.scale)
  if (!layout) return null
  return drawingFromImageScale({
    imageWidthPx: width,
    imageHeightPx: height,
    pxPerMmX: layout.pxPerMmX,
    pxPerMmY: layout.pxPerMmY,
    origin: layout.origin,
    url,
    rotation: layout.rotationDeg ?? 0,
    flipX: layout.flipX === true,
  })
}

/** Bestaande herbruikbare drawing (CDN/url) wint; anders scan uit de blob. */
export function attachWorkspaceUnderlayToFloor(
  floor: Floor,
  blob: FloorWorkspaceBlob,
): Floor {
  if (isReusableUnderlayDrawing(floor.drawing)) return floor
  const drawing = drawingFromWorkspaceBlob(blob)
  if (!drawing) return floor
  return { ...floor, drawing }
}
