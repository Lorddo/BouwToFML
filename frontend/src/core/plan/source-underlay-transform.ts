import type { UnderlayOriginLayout } from './translate-floor-plan'

const ROTATION_EPS_DEG = 0.001

/**
 * Bronplaat (origineel / PDF-ROI) → werkplaat (crop/rotatie/clamp) in pixels.
 * `scale` is densiteit + 3k-clamp, niet de 90°-aswissel.
 * `offset` is de crop in ongeroteerde bronpixels (0 als de plaat al de ROI is).
 */
export type SourceToWorkingTransform = {
  sourceWidthPx: number
  sourceHeightPx: number
  workingWidthPx: number
  workingHeightPx: number
  offsetX: number
  offsetY: number
  scale: number
  rotationDeg: number
  rotate180: boolean
}

export function identitySourceToWorkingTransform(
  widthPx: number,
  heightPx: number,
): SourceToWorkingTransform {
  return {
    sourceWidthPx: widthPx,
    sourceHeightPx: heightPx,
    workingWidthPx: widthPx,
    workingHeightPx: heightPx,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotationDeg: 0,
    rotate180: false,
  }
}

export function bakeRotationDeg(
  transform: Pick<SourceToWorkingTransform, 'rotationDeg' | 'rotate180'>,
): number {
  return (transform.rotationDeg || 0) + (transform.rotate180 ? 180 : 0)
}

export function hasBakeRotation(
  transform: Pick<SourceToWorkingTransform, 'rotationDeg' | 'rotate180'> | null | undefined,
): boolean {
  if (!transform) return false
  return Math.abs(bakeRotationDeg(transform)) >= ROTATION_EPS_DEG
}

/**
 * Tweede/derde «Rotatie vastzetten» (bv. +0,1°) telt bij de vorige bake.
 * Bronplaat blijft de eerste plaat; werkmaat + schaal volgen de laatste bake.
 */
export function composeSourceToWorkingBake(
  prev: SourceToWorkingTransform | null | undefined,
  increment: SourceToWorkingTransform,
): SourceToWorkingTransform {
  if (!prev || !hasBakeRotation(prev)) return increment
  const rotationDeg =
    Math.round(((prev.rotationDeg || 0) + (increment.rotationDeg || 0)) * 1000) / 1000
  const prevScale = prev.scale > 0 && Number.isFinite(prev.scale) ? prev.scale : 1
  const nextScale = increment.scale > 0 && Number.isFinite(increment.scale) ? increment.scale : 1
  return {
    sourceWidthPx: prev.sourceWidthPx,
    sourceHeightPx: prev.sourceHeightPx,
    workingWidthPx: increment.workingWidthPx,
    workingHeightPx: increment.workingHeightPx,
    offsetX: prev.offsetX,
    offsetY: prev.offsetY,
    scale: prevScale * nextScale,
    rotationDeg,
    rotate180: (prev.rotate180 === true) !== (increment.rotate180 === true),
  }
}

/** Zet stap-1-rotatie op een identity-transform; laat een echte bake met rust. */
export function applyInputRotationToTransform(
  transform: SourceToWorkingTransform,
  rot: { rotationDeg?: number; rotate180?: boolean } | null | undefined,
): SourceToWorkingTransform {
  if (!rot) return transform
  if (hasBakeRotation(transform)) return transform
  const rotationDeg = rot.rotationDeg ?? 0
  const rotate180 = rot.rotate180 === true
  if (Math.abs(rotationDeg) < ROTATION_EPS_DEG && !rotate180) return transform
  return { ...transform, rotationDeg, rotate180 }
}

/**
 * Werk-layout (muren / nulpunt / herschalen) → layout van de bronplaat.
 * Rotatie uit de bake komt op `rotationDeg` (plaatpixels blijven ongeroteerd).
 */
export function sourceLayoutFromWorking(
  working: UnderlayOriginLayout,
  transform: SourceToWorkingTransform,
): UnderlayOriginLayout | null {
  if (!(transform.sourceWidthPx > 0) || !(transform.sourceHeightPx > 0)) return null
  if (!(transform.workingWidthPx > 0) || !(transform.workingHeightPx > 0)) return null
  if (!(working.pxPerMmX > 0) || !(working.pxPerMmY > 0)) return null
  if (!Number.isFinite(working.pxPerMmX) || !Number.isFinite(working.pxPerMmY)) return null

  const scale =
    transform.scale > 0 && Number.isFinite(transform.scale) ? transform.scale : 1
  const srcPxPerMmX = working.pxPerMmX / scale
  const srcPxPerMmY = working.pxPerMmY / scale
  if (!(srcPxPerMmX > 0) || !(srcPxPerMmY > 0)) return null

  const bakeRot = bakeRotationDeg(transform)
  const displayRot = (working.rotationDeg ?? 0) + bakeRot

  const workingWcm = transform.workingWidthPx / (working.pxPerMmX * 10)
  const workingHcm = transform.workingHeightPx / (working.pxPerMmY * 10)
  const workTopLeft = { x: -working.origin.x, y: -working.origin.y }
  const workCenter = {
    x: workTopLeft.x + workingWcm / 2,
    y: workTopLeft.y + workingHcm / 2,
  }

  let origin: { x: number; y: number }
  if (Math.abs(bakeRot) < ROTATION_EPS_DEG) {
    origin = {
      x: working.origin.x + transform.offsetX / (srcPxPerMmX * 10),
      y: working.origin.y + transform.offsetY / (srcPxPerMmY * 10),
    }
  } else {
    const sourceWcm = transform.sourceWidthPx / (srcPxPerMmX * 10)
    const sourceHcm = transform.sourceHeightPx / (srcPxPerMmY * 10)
    origin = {
      x: -(workCenter.x - sourceWcm / 2),
      y: -(workCenter.y - sourceHcm / 2),
    }
  }

  const layout: UnderlayOriginLayout = {
    origin,
    pxPerMmX: srcPxPerMmX,
    pxPerMmY: srcPxPerMmY,
  }
  if (Math.abs(displayRot) >= ROTATION_EPS_DEG) layout.rotationDeg = displayRot
  if (working.flipX === true) layout.flipX = true
  return layout
}

export function resolveSourceUnderlayLayout(
  working: UnderlayOriginLayout | null | undefined,
  transform: SourceToWorkingTransform | null | undefined,
): UnderlayOriginLayout | null {
  if (!working) return null
  if (!transform) return working
  return sourceLayoutFromWorking(working, transform) ?? working
}
