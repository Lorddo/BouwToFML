import { isReusableUnderlayDrawing } from '@/core/plan/copy-underlay-drawing'
import { drawingFromImageScale } from '@/core/plan/drawing-to-underlay-layout'
import {
  applyInputRotationToTransform,
  hasBakeRotation,
  identitySourceToWorkingTransform,
  resolveSourceUnderlayLayout,
  type SourceToWorkingTransform,
} from '@/core/plan/source-underlay-transform'
import type { DrawingMeta, Floor } from '@/core/plan/types'
import type { DevWorkspaceSession } from '@/platform/dev-workspace'
import { resolveReuseInputRotation } from './reuse-underlay-pdf'
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

function plateFromBlob(blob: FloorWorkspaceBlob): {
  url: string
  width: number
  height: number
} | null {
  const plate = blob.planUnderlay
  if (plate && plate.width > 0 && plate.height > 0) {
    const url = (plate.remoteUrl && plate.remoteUrl.trim()) || plate.src
    if (url) return { url, width: plate.width, height: plate.height }
  }
  const source = blob.sourceUnderlay?.src
  const transform = blob.sourceToWorking
  if (source && transform && transform.sourceWidthPx > 0 && transform.sourceHeightPx > 0) {
    return { url: source, width: transform.sourceWidthPx, height: transform.sourceHeightPx }
  }
  const session = blob.session
  if (source && session && session.imageWidth > 0 && session.imageHeight > 0) {
    return { url: source, width: session.imageWidth, height: session.imageHeight }
  }
  if (
    session &&
    typeof session.workingImagePng === 'string' &&
    session.workingImagePng.trim() &&
    session.imageWidth > 0 &&
    session.imageHeight > 0
  ) {
    return {
      url: session.workingImagePng,
      width: session.imageWidth,
      height: session.imageHeight,
    }
  }
  return null
}

/**
 * Bake-transform, of stap-1-rotatie als de blob nog een identity-transform heeft
 * (schaal bevestigd vóór «Rotatie vastzetten» / Next).
 */
export function resolveBlobSourceToWorking(
  blob: FloorWorkspaceBlob,
): SourceToWorkingTransform | null {
  const plate = plateFromBlob(blob)
  const stored = blob.sourceToWorking ?? null
  const base =
    stored ??
    (plate ? identitySourceToWorkingTransform(plate.width, plate.height) : null)
  if (!base) return null
  if (hasBakeRotation(base)) return base
  const rot = resolveReuseInputRotation({
    source: blob.sourceUnderlay,
    transform: stored,
    sessionPreprocess: blob.session?.preprocess ?? null,
  })
  return applyInputRotationToTransform(base, rot)
}

/**
 * Bronplaat + afgeleide layout → `floor.drawing`.
 * Crop/B/W-werkplaat alleen als er geen bronplaat is (oude blobs).
 */
export function drawingFromWorkspaceBlob(blob: FloorWorkspaceBlob): DrawingMeta | null {
  const plate = plateFromBlob(blob)
  if (!plate) return null
  const workingLayout =
    blob.previewUnderlayLayout ?? layoutFromSessionScale(blob.session?.scale)
  if (!workingLayout) return null
  const layout = resolveSourceUnderlayLayout(workingLayout, resolveBlobSourceToWorking(blob))
  if (!layout) return null
  return drawingFromImageScale({
    imageWidthPx: plate.width,
    imageHeightPx: plate.height,
    pxPerMmX: layout.pxPerMmX,
    pxPerMmY: layout.pxPerMmY,
    origin: layout.origin,
    url: plate.url,
    rotation: layout.rotationDeg ?? 0,
    flipX: layout.flipX === true,
  })
}

/** https-drawing wint; data-URL wordt vervangen door de bronplaat als die er is. */
export function attachWorkspaceUnderlayToFloor(
  floor: Floor,
  blob: FloorWorkspaceBlob,
): Floor {
  const fromBlob = drawingFromWorkspaceBlob(blob)
  if (fromBlob) return { ...floor, drawing: fromBlob }
  const existingUrl = floor.drawing?.url
  if (
    isReusableUnderlayDrawing(floor.drawing) &&
    typeof existingUrl === 'string' &&
    /^https?:\/\//i.test(existingUrl.trim())
  ) {
    return floor
  }
  return floor
}
