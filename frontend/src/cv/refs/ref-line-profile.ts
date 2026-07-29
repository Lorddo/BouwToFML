import type { Segment } from '@/cv/port/wallGraph'
import type { RefBBox, RefLine, RefLineProfile } from './types'

function segmentLength(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

function segmentAngleDeg(seg: Segment): number {
  return (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI
}

function normalizeAngleDeg(deg: number): number {
  let a = deg % 180
  if (a < 0) a += 180
  return a
}

function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b))
  if (d > 90) d = 180 - d
  return d
}

export function classifyLineRelation(
  angleDeg: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  tolDeg = 18,
): RefLine['relation'] {
  const axis = orientation === 'horizontal' ? 0 : 90
  const d = angleDiffDeg(angleDeg, axis)
  if (d <= tolDeg) return 'parallel'
  if (Math.abs(d - 90) <= tolDeg) return 'perp'
  return 'other'
}

function segmentCenterInBox(seg: Segment, bbox: RefBBox): boolean {
  const cx = (seg.a.x + seg.b.x) / 2
  const cy = (seg.a.y + seg.b.y) / 2
  return (
    cx >= bbox.x &&
    cx <= bbox.x + bbox.width &&
    cy >= bbox.y &&
    cy <= bbox.y + bbox.height
  )
}

function clusterAxisPositions(positions: number[], mergeTol: number): number[] {
  if (positions.length === 0) return []
  const sorted = [...positions].sort((a, b) => a - b)
  const out: number[] = []
  let sum = sorted[0]!
  let n = 1
  let start = sorted[0]!
  for (let i = 1; i < sorted.length; i += 1) {
    const v = sorted[i]!
    if (v - start <= mergeTol) {
      sum += v
      n += 1
    } else {
      out.push(Math.round(sum / n))
      sum = v
      n = 1
      start = v
    }
  }
  out.push(Math.round(sum / n))
  return out
}

/**
 * Lijnprofiel uit ruwe ink-segmenten (zelfde bron als muur raw-ink / extractInkLineSegments).
 * Geen left/top-only polish — die mist te veel.
 */
export function buildLineProfile(params: {
  segments: Segment[]
  bbox?: RefBBox
  orientation: 'horizontal' | 'vertical'
  minLengthPx?: number
  preclassified?: RefLine[]
}): RefLineProfile {
  const minLengthPx = params.minLengthPx ?? 4
  const lines: RefLine[] = params.preclassified
    ? params.preclassified.filter((l) => {
        if (l.lengthPx < minLengthPx) return false
        if (!params.bbox) return true
        const seg = { a: l.a, b: l.b }
        return segmentCenterInBox(seg, params.bbox)
      })
    : []
  if (!params.preclassified) {
    for (const seg of params.segments) {
      const lengthPx = segmentLength(seg)
      if (lengthPx < minLengthPx) continue
      if (params.bbox && !segmentCenterInBox(seg, params.bbox)) continue
      const angleDeg = segmentAngleDeg(seg)
      lines.push({
        a: { x: seg.a.x, y: seg.a.y },
        b: { x: seg.b.x, y: seg.b.y },
        lengthPx,
        angleDeg,
        relation: classifyLineRelation(angleDeg, params.orientation),
      })
    }
  }

  const mergeTol = 3
  const parallelBands = clusterAxisPositions(
    lines
      .filter((l) => l.relation === 'parallel')
      .map((l) => (params.orientation === 'horizontal' ? (l.a.y + l.b.y) / 2 : (l.a.x + l.b.x) / 2)),
    mergeTol,
  )
  const perpBands = clusterAxisPositions(
    lines
      .filter((l) => l.relation === 'perp')
      .map((l) => (params.orientation === 'horizontal' ? (l.a.x + l.b.x) / 2 : (l.a.y + l.b.y) / 2)),
    mergeTol,
  )

  return {
    lines,
    parallelCount:
      parallelBands.length > 0 ? parallelBands.length : lines.filter((l) => l.relation === 'parallel').length,
    perpCount: perpBands.length > 0 ? perpBands.length : lines.filter((l) => l.relation === 'perp').length,
    otherCount: lines.filter((l) => l.relation === 'other').length,
    arcCount: lines.filter((l) => l.relation === 'arc').length,
  }
}
