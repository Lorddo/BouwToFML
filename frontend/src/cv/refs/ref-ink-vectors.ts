import type { OpenCV } from '@/cv/loadOpenCV'
import { readRgbaMatFromCanvas } from '@/cv/port/canvasEnv'
import { traceRawInkVectors } from '@/cv/port/rawInkVectors'
import type { Segment } from '@/cv/port/wallGraph'
import { bwDataToCanvas } from './ref-crop-bw'
import { buildLineProfile, classifyLineRelation } from './ref-line-profile'
import type { RefLine, RefLineProfile } from './types'

type ArcHint = {
  center: { x: number; y: number }
  radius: number
  tolerancePx?: number
}

function segmentLength(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

function segmentAngleDeg(seg: Segment): number {
  return (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI
}

function midpoint(seg: Segment): { x: number; y: number } {
  return { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }
}

function isArcLike(seg: Segment, arcHint?: ArcHint): boolean {
  if (!arcHint) return false
  const mp = midpoint(seg)
  const d = Math.hypot(mp.x - arcHint.center.x, mp.y - arcHint.center.y)
  const tol = arcHint.tolerancePx ?? Math.max(2, arcHint.radius * 0.08)
  return Math.abs(d - arcHint.radius) <= tol
}

export function extractRawInkSegments(params: {
  cv: OpenCV
  bwData: Uint8Array
  width: number
  height: number
}): Segment[] {
  const bwCanvas = bwDataToCanvas(params.bwData, params.width, params.height)
  const rgba = readRgbaMatFromCanvas(params.cv, bwCanvas)
  const bwMat = new params.cv.Mat()
  params.cv.cvtColor(rgba, bwMat, params.cv.COLOR_RGBA2GRAY, 0)
  rgba.delete()
  try {
    return traceRawInkVectors(params.cv, bwMat)
  } finally {
    bwMat.delete()
  }
}

export function classifyRawSegments(params: {
  segments: Segment[]
  orientation: 'horizontal' | 'vertical'
  minLengthPx?: number
  arcHint?: ArcHint
}): RefLine[] {
  const minLen = params.minLengthPx ?? 3
  const out: RefLine[] = []
  for (const seg of params.segments) {
    const lengthPx = segmentLength(seg)
    if (lengthPx < minLen) continue
    const angleDeg = segmentAngleDeg(seg)
    let relation = classifyLineRelation(angleDeg, params.orientation)
    if (relation === 'other' && isArcLike(seg, params.arcHint)) relation = 'arc'
    out.push({
      a: { x: seg.a.x, y: seg.a.y },
      b: { x: seg.b.x, y: seg.b.y },
      lengthPx,
      angleDeg,
      relation,
    })
  }
  return out
}

export function buildClassifiedProfile(params: {
  lines: RefLine[]
  orientation: 'horizontal' | 'vertical'
}): RefLineProfile {
  return buildLineProfile({
    segments: params.lines.map((l) => ({ a: l.a, b: l.b })),
    orientation: params.orientation,
    minLengthPx: 0,
    preclassified: params.lines,
  })
}
