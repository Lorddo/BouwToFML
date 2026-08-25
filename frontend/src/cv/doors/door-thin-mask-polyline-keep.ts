import { tally } from '@/core/diagnostics'
import { resolveMergedLabel } from '@/cv/walls/rooms/room-raster-merge'
import type { Segment } from '@/cv/port/wallGraph'
import { resolveDoorBetweenWallsAxis } from './door-bridge-wall-promote'

/** Band: afstand tot hartlijn ≲ 0,25× muurdikte. */
export const POLYLINE_KEEP_BAND_THICKNESS_RATIO = 0.25

/** As mee: |cos| ≥ dit (~30°). */
const AXIS_ALIGN_MIN_ABS_COS = Math.cos((30 * Math.PI) / 180)

/** Max gap tussen twee I-einden voor bridge (× muurdikte). */
const BRIDGE_GAP_MAX_THICKNESS_RATIO = 4

export type PolylineKeepHyp = {
  faceIds: readonly number[]
  unionBBox: { x: number; y: number; width: number; height: number }
}

export type PolylineKeepContext = {
  /** Meetlint-segmenten (één L1-trace op mask zonder deuren). */
  segments: readonly Segment[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  referenceWallThicknessPx: number
}

function segLen(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

function segDir(seg: Segment): { dx: number; dy: number } {
  const len = Math.max(1e-6, segLen(seg))
  return { dx: (seg.b.x - seg.a.x) / len, dy: (seg.b.y - seg.a.y) / len }
}

function hypAxisDir(bbox: { width: number; height: number }): { dx: number; dy: number } {
  return resolveDoorBetweenWallsAxis(bbox) === 'h' ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 }
}

function absDot(a: { dx: number; dy: number }, b: { dx: number; dy: number }): number {
  return Math.abs(a.dx * b.dx + a.dy * b.dy)
}

function pointToSegDistance(px: number, py: number, seg: Segment): number {
  const abx = seg.b.x - seg.a.x
  const aby = seg.b.y - seg.a.y
  const len2 = abx * abx + aby * aby
  if (len2 < 1e-6) return Math.hypot(px - seg.a.x, py - seg.a.y)
  let t = ((px - seg.a.x) * abx + (py - seg.a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  const qx = seg.a.x + t * abx
  const qy = seg.a.y + t * aby
  return Math.hypot(px - qx, py - qy)
}

function nearestSegment(
  px: number,
  py: number,
  segments: readonly Segment[],
): { seg: Segment; dist: number } | null {
  let best: { seg: Segment; dist: number } | null = null
  for (const seg of segments) {
    if (segLen(seg) < 2) continue
    const dist = pointToSegDistance(px, py, seg)
    if (!best || dist < best.dist) best = { seg, dist }
  }
  return best
}

function sampleHypPoints(params: {
  faceIds: readonly number[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  bbox: { x: number; y: number; width: number; height: number }
}): Array<{ x: number; y: number }> {
  const roots = new Set<number>()
  for (const id of params.faceIds) {
    if (id <= 0) continue
    const root = resolveMergedLabel(id, params.parentMap)
    if (root > 0) roots.add(root)
  }
  const points: Array<{ x: number; y: number }> = []
  if (roots.size === 0) {
    // Fallback: bbox-steekproef
    const { x, y, width, height } = params.bbox
    for (const q of [0.25, 0.5, 0.75]) {
      points.push({ x: x + width * q, y: y + height * 0.5 })
      points.push({ x: x + width * 0.5, y: y + height * q })
    }
    return points
  }
  const { labelsData, width, height, parentMap, bbox } = params
  const x0 = Math.max(0, Math.floor(bbox.x))
  const y0 = Math.max(0, Math.floor(bbox.y))
  const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width))
  const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height))
  const step = Math.max(1, Math.floor(Math.min(bbox.width, bbox.height) / 6))
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const raw = labelsData[y * width + x] ?? 0
      if (raw <= 0) continue
      if (!roots.has(resolveMergedLabel(raw, parentMap))) continue
      points.push({ x: x + 0.5, y: y + 0.5 })
    }
  }
  if (points.length === 0) {
    points.push({
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2,
    })
  }
  return points
}

/**
 * In-band: afstand tot lijn ≲ 0,25× dikte én as mee.
 * Geen “geraakt”-test — blad tegen binnenkant valt hier buiten.
 */
export function isHypInPolylineBand(params: {
  hyp: PolylineKeepHyp
  segments: readonly Segment[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  bandPx: number
}): boolean {
  if (params.segments.length === 0 || !(params.bandPx > 0)) return false
  const samples = sampleHypPoints({
    faceIds: params.hyp.faceIds,
    labelsData: params.labelsData,
    width: params.width,
    height: params.height,
    parentMap: params.parentMap,
    bbox: params.hyp.unionBBox,
  })
  const hypDir = hypAxisDir(params.hyp.unionBBox)
  const dists: number[] = []
  let alignedHits = 0
  for (const p of samples) {
    const near = nearestSegment(p.x, p.y, params.segments)
    if (!near) return false
    dists.push(near.dist)
    if (absDot(hypDir, segDir(near.seg)) >= AXIS_ALIGN_MIN_ABS_COS) alignedHits += 1
  }
  dists.sort((a, b) => a - b)
  const median = dists[Math.floor(dists.length / 2)] ?? Infinity
  if (!(median <= params.bandPx)) return false
  // Meeste samples as-mee met dichtstbijzijnde segment
  return alignedHits >= Math.ceil(samples.length * 0.5)
}

type Endpoint = { x: number; y: number; seg: Segment; end: 'a' | 'b' }

function collectEndpoints(segments: readonly Segment[]): Endpoint[] {
  const out: Endpoint[] = []
  for (const seg of segments) {
    if (segLen(seg) < 2) continue
    out.push({ x: seg.a.x, y: seg.a.y, seg, end: 'a' })
    out.push({ x: seg.b.x, y: seg.b.y, seg, end: 'b' })
  }
  return out
}

/** Ruwe I-eind: endpoint dat niet dicht bij een ander segment-midden/eind ligt (behalve eigen). */
function isLikelyIEnd(ep: Endpoint, all: readonly Endpoint[], joinPx: number): boolean {
  let nearOthers = 0
  for (const other of all) {
    if (other.seg === ep.seg) continue
    const d = Math.hypot(other.x - ep.x, other.y - ep.y)
    if (d <= joinPx) nearOthers += 1
  }
  return nearOthers === 0
}

/**
 * Bridge: twee I-einden zouden collinear één segment worden over het hyp-gat.
 */
export function isHypPolylineBridge(params: {
  hyp: PolylineKeepHyp
  segments: readonly Segment[]
  wallRefPx: number
}): boolean {
  const { hyp, segments, wallRefPx } = params
  if (segments.length < 1 || !(wallRefPx > 0)) return false
  const joinPx = Math.max(4, Math.round(wallRefPx * 0.75))
  const maxGap = Math.max(wallRefPx, Math.round(wallRefPx * BRIDGE_GAP_MAX_THICKNESS_RATIO))
  const allEnds = collectEndpoints(segments)
  const endpoints = allEnds.filter((ep) => isLikelyIEnd(ep, allEnds, joinPx))
  if (endpoints.length < 2) return false

  const hypDir = hypAxisDir(hyp.unionBBox)
  const cx = hyp.unionBBox.x + hyp.unionBBox.width / 2
  const cy = hyp.unionBBox.y + hyp.unionBBox.height / 2
  const band = Math.max(2, wallRefPx * POLYLINE_KEEP_BAND_THICKNESS_RATIO)

  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      const a = endpoints[i]
      const b = endpoints[j]
      if (a.seg === b.seg) continue
      const gap = Math.hypot(b.x - a.x, b.y - a.y)
      if (gap < wallRefPx * 0.5 || gap > maxGap) continue
      const bridgeDir = {
        dx: (b.x - a.x) / gap,
        dy: (b.y - a.y) / gap,
      }
      // Collinear stubs: beide segmenten ≈ bridge-as
      if (absDot(segDir(a.seg), bridgeDir) < AXIS_ALIGN_MIN_ABS_COS) continue
      if (absDot(segDir(b.seg), bridgeDir) < AXIS_ALIGN_MIN_ABS_COS) continue
      // Hyp as mee met de brug
      if (absDot(hypDir, bridgeDir) < AXIS_ALIGN_MIN_ABS_COS) continue
      // Hyp-centrum in-band t.o.v. A→B
      const bridgeSeg: Segment = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }
      if (pointToSegDistance(cx, cy, bridgeSeg) > band * 2) continue
      // Centrum tussen de einden (niet erbuiten)
      const t = ((cx - a.x) * (b.x - a.x) + (cy - a.y) * (b.y - a.y)) / (gap * gap)
      if (t < 0.05 || t > 0.95) continue
      return true
    }
  }
  return false
}

/**
 * T/zijwaarts: hyp raakt lijn vooral loodrecht (nieuwe T) of trekt as zijwaarts.
 * Geen keep — dat is swing/blad.
 */
export function isHypPolylineSidewaysOrT(params: {
  hyp: PolylineKeepHyp
  segments: readonly Segment[]
  labelsData: Int32Array
  width: number
  height: number
  parentMap: Map<number, number>
  bandPx: number
}): boolean {
  if (params.segments.length === 0) return false
  const hypDir = hypAxisDir(params.hyp.unionBBox)
  const cx = params.hyp.unionBBox.x + params.hyp.unionBBox.width / 2
  const cy = params.hyp.unionBBox.y + params.hyp.unionBBox.height / 2
  const near = nearestSegment(cx, cy, params.segments)
  if (!near) return false
  const align = absDot(hypDir, segDir(near.seg))
  // Loodrecht op de hartlijn + dichtbij → T-tak / blad
  if (align < 0.5 && near.dist <= params.bandPx * 2) return true
  // Dichtbij maar as niet mee én buiten strakke band → zijwaarts trekken
  if (align < AXIS_ALIGN_MIN_ABS_COS && near.dist <= params.bandPx * 3) {
    if (!isHypInPolylineBand(params)) return true
  }
  return false
}

/**
 * Laag 3 — polylijn pakt het kozijn, niet de swing.
 * Keep alleen: in-band (steunt bestaande lijn) of bridge (twee I-einden).
 * Reject: T / zijwaarts (blad).
 */
// ESC:D-63 (A)
export function isThinHypPolylineKeep(hyp: PolylineKeepHyp, ctx: PolylineKeepContext): boolean {
  if (ctx.segments.length === 0) return false
  const wallRef = Math.max(0, ctx.referenceWallThicknessPx)
  if (!(wallRef > 0)) return false
  const bandPx = Math.max(2, wallRef * POLYLINE_KEEP_BAND_THICKNESS_RATIO)

  if (
    isHypPolylineSidewaysOrT({
      hyp,
      segments: ctx.segments,
      labelsData: ctx.labelsData,
      width: ctx.width,
      height: ctx.height,
      parentMap: ctx.parentMap,
      bandPx,
    })
  ) {
    tally('D-63', 'polyline_skip_t_or_sideways')
    return false
  }

  if (
    isHypInPolylineBand({
      hyp,
      segments: ctx.segments,
      labelsData: ctx.labelsData,
      width: ctx.width,
      height: ctx.height,
      parentMap: ctx.parentMap,
      bandPx,
    })
  ) {
    tally('D-63', 'polyline_keep_in_band')
    return true
  }

  if (isHypPolylineBridge({ hyp, segments: ctx.segments, wallRefPx: wallRef })) {
    tally('D-63', 'polyline_keep_bridge')
    return true
  }

  tally('D-63', 'polyline_skip_no_support')
  return false
}
