/**
 * L3-assen → dikte-samplepunten op de hartlijn (niet op H/V-trap).
 * Lidmaatschap = band + bewijsspan (zelfde idee als collectMembers, zonder flood).
 */
import type { ObliqueAxis } from '@/cv/walls/rooms/pipeline-v3/engines/oblique/axis-inventory'
import {
  projectOnto,
  projectT,
  signedOffset,
  type AxisLine,
} from '@/cv/walls/rooms/pipeline-v3/engines/oblique/axis-line'

export type ThicknessAxisHint = {
  anchor: { x: number; y: number }
  direction: { x: number; y: number }
  tMin: number
  tMax: number
}

export function toThicknessAxisHints(axes: readonly ObliqueAxis[]): ThicknessAxisHint[] {
  return axes.map((axis) => ({
    anchor: { ...axis.line.anchor },
    direction: { ...axis.line.direction },
    tMin: axis.tMin,
    tMax: axis.tMax,
  }))
}

function asLine(hint: ThicknessAxisHint): AxisLine {
  return { anchor: hint.anchor, direction: hint.direction }
}

function segmentOverlapsSpan(
  line: AxisLine,
  a: { x: number; y: number },
  b: { x: number; y: number },
  tMin: number,
  tMax: number,
): boolean {
  const ta = projectT(line, a)
  const tb = projectT(line, b)
  return Math.max(ta, tb) >= tMin && Math.min(ta, tb) <= tMax
}

/** Dichtstbijzijnde as waarvan beide einden in de capture-band liggen en de span raken. */
export function findThicknessAxisForSegment(params: {
  a: { x: number; y: number }
  b: { x: number; y: number }
  axes: readonly ThicknessAxisHint[]
  captureBandPx: number
}): ThicknessAxisHint | null {
  const { a, b, axes, captureBandPx } = params
  if (!axes.length || !(captureBandPx > 0)) return null
  let best: ThicknessAxisHint | null = null
  let bestOffset = Number.POSITIVE_INFINITY
  for (const hint of axes) {
    const line = asLine(hint)
    const oa = Math.abs(signedOffset(line, a))
    const ob = Math.abs(signedOffset(line, b))
    if (oa > captureBandPx || ob > captureBandPx) continue
    if (!segmentOverlapsSpan(line, a, b, hint.tMin, hint.tMax)) continue
    const midOffset = (oa + ob) / 2
    if (midOffset < bestOffset) {
      bestOffset = midOffset
      best = hint
    }
  }
  return best
}

/** Projecteer einden op de as zodat DT/walk op de ridge sampelt. */
export function projectSegmentEndsOntoAxis(
  a: { x: number; y: number },
  b: { x: number; y: number },
  hint: ThicknessAxisHint,
): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const line = asLine(hint)
  return { a: projectOnto(line, a), b: projectOnto(line, b) }
}

export function resolveThicknessSampleEnds(params: {
  a: { x: number; y: number }
  b: { x: number; y: number }
  axes?: readonly ThicknessAxisHint[] | null
  captureBandPx?: number
}): {
  a: { x: number; y: number }
  b: { x: number; y: number }
  axis: ThicknessAxisHint | null
} {
  const axes = params.axes ?? []
  const captureBandPx = params.captureBandPx ?? 0
  const axis = findThicknessAxisForSegment({
    a: params.a,
    b: params.b,
    axes,
    captureBandPx,
  })
  if (!axis) return { a: params.a, b: params.b, axis: null }
  const projected = projectSegmentEndsOntoAxis(params.a, params.b, axis)
  return { ...projected, axis }
}
