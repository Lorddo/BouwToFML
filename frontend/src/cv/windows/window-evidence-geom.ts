import type { RootFace } from './window-axel-strip-geometry'
import { WINDOW_EVIDENCE_TUNING } from './window-evidence-tuning'
import type { WindowAxelHypothesis, WindowAxelOrientation } from './types'

export type EvidenceBBox = RootFace['bbox'] | WindowAxelHypothesis['unionBBox']

export function axisStart(rect: EvidenceBBox, orientation: WindowAxelOrientation): number {
  return orientation === 'horizontal' ? rect.x : rect.y
}

export function axisEnd(rect: EvidenceBBox, orientation: WindowAxelOrientation): number {
  return axisStart(rect, orientation) + (orientation === 'horizontal' ? rect.width : rect.height)
}

export function axisCenter(rect: EvidenceBBox, orientation: WindowAxelOrientation): number {
  return (axisStart(rect, orientation) + axisEnd(rect, orientation)) / 2
}

export function axisSpan(rect: EvidenceBBox, orientation: WindowAxelOrientation): number {
  return orientation === 'horizontal' ? rect.width : rect.height
}

export function perpStart(rect: EvidenceBBox, orientation: WindowAxelOrientation): number {
  return orientation === 'horizontal' ? rect.y : rect.x
}

export function perpEnd(rect: EvidenceBBox, orientation: WindowAxelOrientation): number {
  return perpStart(rect, orientation) + (orientation === 'horizontal' ? rect.height : rect.width)
}

export function perpSpan(rect: EvidenceBBox, orientation: WindowAxelOrientation): number {
  return orientation === 'horizontal' ? rect.height : rect.width
}

export function overlapLength(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

export function unionBBox(
  a: WindowAxelHypothesis['unionBBox'],
  b: WindowAxelHypothesis['unionBBox'],
): WindowAxelHypothesis['unionBBox'] {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function overlapRatioAlongAxis(params: {
  a: WindowAxelHypothesis['unionBBox']
  b: WindowAxelHypothesis['unionBBox']
  orientation: WindowAxelOrientation
}): number {
  const overlap = overlapLength(
    axisStart(params.a, params.orientation),
    axisEnd(params.a, params.orientation),
    axisStart(params.b, params.orientation),
    axisEnd(params.b, params.orientation),
  )
  const base = Math.max(
    1,
    Math.min(
      axisEnd(params.a, params.orientation) - axisStart(params.a, params.orientation),
      axisEnd(params.b, params.orientation) - axisStart(params.b, params.orientation),
    ),
  )
  return overlap / base
}

export function perpGapPx(params: {
  a: WindowAxelHypothesis['unionBBox']
  b: WindowAxelHypothesis['unionBBox']
  orientation: WindowAxelOrientation
}): number {
  const a0 = perpStart(params.a, params.orientation)
  const a1 = perpEnd(params.a, params.orientation)
  const b0 = perpStart(params.b, params.orientation)
  const b1 = perpEnd(params.b, params.orientation)
  if (a1 < b0) return b0 - a1
  if (b1 < a0) return a0 - b1
  return 0
}

export function normalizeSizeForOrientation(params: {
  widthPx: number
  heightPx: number
  orientation: WindowAxelOrientation
}): { widthPx: number; heightPx: number } {
  if (params.orientation === 'horizontal') {
    return { widthPx: params.widthPx, heightPx: params.heightPx }
  }
  // Ref-ranges voor verticale ramen worden in genormaliseerde (geroteerde) ruimte gemeten.
  return { widthPx: params.heightPx, heightPx: params.widthPx }
}

/** Lokale as-band van de hypothese (perp-span) — enige schaal-input voor ratio→px. */
export function resolveLocalAxisBandPx(params: {
  hypothesis: WindowAxelHypothesis
  orientation: WindowAxelOrientation
}): number {
  return Math.max(
    1,
    params.orientation === 'horizontal'
      ? params.hypothesis.unionBBox.height
      : params.hypothesis.unionBBox.width,
  )
}

/** Kandidaat-band loodrecht op de muur (± marge); framing moet hier volledig in vallen. */
export function resolveFramingBand(params: {
  hypothesis: WindowAxelHypothesis['unionBBox']
  orientation: WindowAxelOrientation
  marginRatio?: number
}): { min: number; max: number } {
  const marginRatio = params.marginRatio ?? WINDOW_EVIDENCE_TUNING.framingBandMarginRatio
  const start = perpStart(params.hypothesis, params.orientation)
  const end = perpEnd(params.hypothesis, params.orientation)
  const pad = Math.max(0, (end - start) * marginRatio)
  return { min: start - pad, max: end + pad }
}

export function isFullyInsideFramingBand(params: {
  face: RootFace['bbox']
  band: { min: number; max: number }
  orientation: WindowAxelOrientation
}): boolean {
  const faceStart = perpStart(params.face, params.orientation)
  const faceEnd = perpEnd(params.face, params.orientation)
  return faceStart >= params.band.min - 1e-6 && faceEnd <= params.band.max + 1e-6
}

export function unionRootsBBox(
  faceIds: number[],
  facesByRoot: Map<number, RootFace>,
): WindowAxelHypothesis['unionBBox'] | null {
  let merged: WindowAxelHypothesis['unionBBox'] | null = null
  for (const faceId of faceIds) {
    const face = facesByRoot.get(faceId)
    if (!face) continue
    if (!merged) {
      merged = { ...face.bbox }
      continue
    }
    merged = unionBBox(merged, face.bbox)
  }
  return merged
}
