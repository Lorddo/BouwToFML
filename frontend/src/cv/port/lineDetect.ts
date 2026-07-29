import type { OpenCV } from '@/cv/loadOpenCV'
import { getOpenCvCapabilities } from './opencvCapabilities'
import type { Segment } from './wallGraph'

export interface BaselineResult {
  segments: Segment[]
  lineCount: number
  truncated: boolean
  houghCount: number
  lsdCount: number
  mergedCount: number
}

export interface BinaryBoundaryOptions {
  minLengthPx?: number
  mergeGapPx?: number
  axisAlignTolPx?: number
}

const MAX_LINES = 1600
const DEFAULT_MIN_SEGMENT_PX = 8
const DEFAULT_MERGE_GAP_PX = 10
const DEFAULT_AXIS_ALIGN_TOL_PX = 2
const INK_THRESHOLD = 128
const BOUNDARY_SUPPORT_RATIO = 0.6

function keyForSegment(x1: number, y1: number, x2: number, y2: number): string {
  const ax = Math.round(x1 / 6)
  const ay = Math.round(y1 / 6)
  const bx = Math.round(x2 / 6)
  const by = Math.round(y2 / 6)
  return `${Math.min(ax, bx)}:${Math.min(ay, by)}-${Math.max(ax, bx)}:${Math.max(ay, by)}`
}

function segmentFromRaw(x1: number, y1: number, x2: number, y2: number): Segment {
  return {
    a: { x: Math.round(x1), y: Math.round(y1) },
    b: { x: Math.round(x2), y: Math.round(y2) },
  }
}

function segmentLength(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
}

function dedupeSegments(seed: Segment[], incoming: Segment[]): Segment[] {
  const merged = [...seed]
  const seen = new Set(seed.map((seg) => keyForSegment(seg.a.x, seg.a.y, seg.b.x, seg.b.y)))
  for (const seg of incoming) {
    const key = keyForSegment(seg.a.x, seg.a.y, seg.b.x, seg.b.y)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(seg)
    if (merged.length >= MAX_LINES) break
  }
  return merged
}

function isInkAt(data: Uint8Array, cols: number, rows: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return false
  return data[y * cols + x] < INK_THRESHOLD
}

/** B/W muur-mat: inkt = 0, achtergrond = 255. */
function matIsBinaryInkMat(mat: { data: Uint8Array | Int8Array | Uint8ClampedArray }): boolean {
  const data = mat.data
  const step = Math.max(1, Math.floor(data.length / 4096))
  for (let i = 0; i < data.length; i += step) {
    const v = data[i]
    if (v !== 0 && v !== 255) return false
  }
  return true
}

function isInkBoundaryPixel(
  data: Uint8Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return false
  const ink = isInkAt(data, cols, rows, x, y)
  if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) return true
  return (
    isInkAt(data, cols, rows, x - 1, y) !== ink ||
    isInkAt(data, cols, rows, x + 1, y) !== ink ||
    isInkAt(data, cols, rows, x, y - 1) !== ink ||
    isInkAt(data, cols, rows, x, y + 1) !== ink
  )
}

export function segmentNearInkBoundary(
  data: Uint8Array,
  cols: number,
  rows: number,
  seg: Segment,
  minRatio = BOUNDARY_SUPPORT_RATIO,
): boolean {
  const len = segmentLength(seg)
  if (len < 1) return false
  const steps = Math.max(2, Math.ceil(len / 4))
  let hits = 0
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const x = Math.round(seg.a.x + (seg.b.x - seg.a.x) * t)
    const y = Math.round(seg.a.y + (seg.b.y - seg.a.y) * t)
    let near = false
    for (let dy = -1; dy <= 1 && !near; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (isInkBoundaryPixel(data, cols, rows, x + dx, y + dy)) {
          near = true
          break
        }
      }
    }
    if (near) hits += 1
  }
  return hits / (steps + 1) >= minRatio
}

export function filterSegmentsNearInkBoundary(
  cols: number,
  rows: number,
  data: Uint8Array,
  segments: Segment[],
): Segment[] {
  return segments.filter((seg) => segmentNearInkBoundary(data, cols, rows, seg))
}

function snapSegmentOrthogonal(seg: Segment, tolDeg = 12): Segment | null {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len = Math.hypot(dx, dy)
  if (len < 2) return null
  const deg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI)
  if (deg < tolDeg || deg > 180 - tolDeg) {
    const y = Math.round((seg.a.y + seg.b.y) / 2)
    return {
      a: { x: Math.min(seg.a.x, seg.b.x), y },
      b: { x: Math.max(seg.a.x, seg.b.x), y },
    }
  }
  if (Math.abs(deg - 90) < tolDeg) {
    const x = Math.round((seg.a.x + seg.b.x) / 2)
    return {
      a: { x, y: Math.min(seg.a.y, seg.b.y) },
      b: { x, y: Math.max(seg.a.y, seg.b.y) },
    }
  }
  return null
}

function mergeHorizontalRuns(
  items: Array<{ y: number; x0: number; x1: number }>,
  mergeGapPx: number,
  axisAlignTolPx: number,
): Segment[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0)
  const merged: Array<{ y: number; x0: number; x1: number }> = []

  for (const item of sorted) {
    const prev = merged[merged.length - 1]
    if (prev && Math.abs(prev.y - item.y) <= axisAlignTolPx && item.x0 <= prev.x1 + mergeGapPx) {
      prev.x1 = Math.max(prev.x1, item.x1)
      prev.y = Math.round((prev.y + item.y) / 2)
    } else {
      merged.push({ ...item })
    }
  }

  return merged.map((m) => ({
    a: { x: m.x0, y: m.y },
    b: { x: m.x1, y: m.y },
  }))
}

function mergeVerticalRuns(
  items: Array<{ x: number; y0: number; y1: number }>,
  mergeGapPx: number,
  axisAlignTolPx: number,
): Segment[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => a.x - b.x || a.y0 - b.y0)
  const merged: Array<{ x: number; y0: number; y1: number }> = []

  for (const item of sorted) {
    const prev = merged[merged.length - 1]
    if (prev && Math.abs(prev.x - item.x) <= axisAlignTolPx && item.y0 <= prev.y1 + mergeGapPx) {
      prev.y1 = Math.max(prev.y1, item.y1)
      prev.x = Math.round((prev.x + item.x) / 2)
    } else {
      merged.push({ ...item })
    }
  }

  return merged.map((m) => ({
    a: { x: m.x, y: m.y0 },
    b: { x: m.x, y: m.y1 },
  }))
}

/** Voeg collineaire segmenten samen; standaard max 10px gat op dezelfde lijn. */
export function mergeCollinearBoundarySegments(
  segments: Segment[],
  options: BinaryBoundaryOptions = {},
): Segment[] {
  const mergeGapPx = options.mergeGapPx ?? DEFAULT_MERGE_GAP_PX
  const axisAlignTolPx = options.axisAlignTolPx ?? DEFAULT_AXIS_ALIGN_TOL_PX
  const minLengthPx = options.minLengthPx ?? DEFAULT_MIN_SEGMENT_PX

  const horizontal: Array<{ y: number; x0: number; x1: number }> = []
  const vertical: Array<{ x: number; y0: number; y1: number }> = []

  for (const seg of segments) {
    const dx = Math.abs(seg.b.x - seg.a.x)
    const dy = Math.abs(seg.b.y - seg.a.y)
    if (segmentLength(seg) < minLengthPx) continue

    if (dy === 0 && dx > 0) {
      horizontal.push({
        y: seg.a.y,
        x0: Math.min(seg.a.x, seg.b.x),
        x1: Math.max(seg.a.x, seg.b.x),
      })
    } else if (dx === 0 && dy > 0) {
      vertical.push({
        x: seg.a.x,
        y0: Math.min(seg.a.y, seg.b.y),
        y1: Math.max(seg.a.y, seg.b.y),
      })
    }
  }

  return [
    ...mergeHorizontalRuns(horizontal, mergeGapPx, axisAlignTolPx),
    ...mergeVerticalRuns(vertical, mergeGapPx, axisAlignTolPx),
  ].filter((seg) => segmentLength(seg) >= minLengthPx)
}

function postProcessBinarySegments(
  cols: number,
  rows: number,
  data: Uint8Array,
  segments: Segment[],
  options?: BinaryBoundaryOptions,
): Segment[] {
  const snapped = segments
    .map((seg) => snapSegmentOrthogonal(seg))
    .filter((seg): seg is Segment => seg !== null)
  const onBoundary = filterSegmentsNearInkBoundary(cols, rows, data, snapped)
  return mergeCollinearBoundarySegments(onBoundary, options)
}

/** Vereenvoudig ruwe contour-vectoren tot as-aligned lijnen voor pairing/skeleton-debug. */
export function simplifyRawInkSegments(
  mat: OpenCV['Mat'],
  segments: Segment[],
  options?: BinaryBoundaryOptions,
): Segment[] {
  const data = mat.data instanceof Uint8Array ? mat.data : new Uint8Array(mat.data)
  return postProcessBinarySegments(mat.cols, mat.rows, data, segments, options)
}

/**
 * Hough op B/W muur-mat: Canny zonder blur, daarna merge + inkt-randfilter.
 */
function detectBinaryHoughSegments(cv: OpenCV, mat: OpenCV['Mat']): Segment[] {
  const edges = new cv.Mat()
  const linesStrong = new cv.Mat()
  const linesLoose = new cv.Mat()
  const segments: Segment[] = []
  const seen = new Set<string>()
  const data = mat.data instanceof Uint8Array ? mat.data : new Uint8Array(mat.data)

  try {
    cv.Canny(mat, edges, 50, 150, 3, false)
    cv.HoughLinesP(edges, linesStrong, 1, Math.PI / 180, 50, 20, DEFAULT_MERGE_GAP_PX)
    cv.HoughLinesP(edges, linesLoose, 1, Math.PI / 180, 32, 12, DEFAULT_MERGE_GAP_PX)

    const pushFromMat = (src: OpenCV['Mat']) => {
      const limit = Math.min(src.rows, MAX_LINES)
      for (let i = 0; i < limit; i += 1) {
        const x1 = src.data32S[i * 4]
        const y1 = src.data32S[i * 4 + 1]
        const x2 = src.data32S[i * 4 + 2]
        const y2 = src.data32S[i * 4 + 3]
        const key = keyForSegment(x1, y1, x2, y2)
        if (seen.has(key)) continue
        seen.add(key)
        segments.push(segmentFromRaw(x1, y1, x2, y2))
        if (segments.length >= MAX_LINES) return
      }
    }

    pushFromMat(linesStrong)
    if (segments.length < MAX_LINES) pushFromMat(linesLoose)
    return postProcessBinarySegments(mat.cols, mat.rows, data, segments)
  } finally {
    linesLoose.delete()
    linesStrong.delete()
    edges.delete()
  }
}

/** Fallback voor niet-binaire input (bijv. grayscale deskew-sample). */
function detectGrayscaleHoughSegments(cv: OpenCV, gray: OpenCV['Mat']): Segment[] {
  const edges = new cv.Mat()
  const blurred = new cv.Mat()
  const linesStrong = new cv.Mat()
  const linesLoose = new cv.Mat()
  const segments: Segment[] = []
  const seen = new Set<string>()
  try {
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 50, 150)
    cv.HoughLinesP(edges, linesStrong, 1, Math.PI / 180, 80, 45, DEFAULT_MERGE_GAP_PX)
    cv.HoughLinesP(edges, linesLoose, 1, Math.PI / 180, 42, 24, DEFAULT_MERGE_GAP_PX)

    const pushFromMat = (src: OpenCV['Mat']) => {
      const limit = Math.min(src.rows, MAX_LINES)
      for (let i = 0; i < limit; i += 1) {
        const x1 = src.data32S[i * 4]
        const y1 = src.data32S[i * 4 + 1]
        const x2 = src.data32S[i * 4 + 2]
        const y2 = src.data32S[i * 4 + 3]
        const key = keyForSegment(x1, y1, x2, y2)
        if (seen.has(key)) continue
        seen.add(key)
        segments.push(segmentFromRaw(x1, y1, x2, y2))
        if (segments.length >= MAX_LINES) return
      }
    }

    pushFromMat(linesStrong)
    if (segments.length < MAX_LINES) pushFromMat(linesLoose)
    return segments
  } finally {
    linesLoose.delete()
    linesStrong.delete()
    edges.delete()
    blurred.delete()
  }
}

function detectHoughSegments(cv: OpenCV, mat: OpenCV['Mat']): Segment[] {
  if (matIsBinaryInkMat(mat)) {
    return detectBinaryHoughSegments(cv, mat)
  }
  return detectGrayscaleHoughSegments(cv, mat)
}

function detectLsdSegments(cv: OpenCV, gray: OpenCV['Mat']): Segment[] {
  const caps = getOpenCvCapabilities(cv)
  if (!caps.lsd) return []
  let detector: any = null
  const lines = new cv.Mat()
  try {
    detector = cv.createLineSegmentDetector(cv.LSD_REFINE_STD)
    detector.detect(gray, lines)
    const out: Segment[] = []
    const raw = lines.data32F
    const limit = Math.min(lines.rows, MAX_LINES)
    for (let i = 0; i < limit; i += 1) {
      const x1 = raw[i * 4]
      const y1 = raw[i * 4 + 1]
      const x2 = raw[i * 4 + 2]
      const y2 = raw[i * 4 + 3]
      out.push(segmentFromRaw(x1, y1, x2, y2))
    }
    return out
  } catch {
    return []
  } finally {
    lines.delete()
    if (detector && typeof detector.delete === 'function') detector.delete()
  }
}

function finalizeSegments(mat: OpenCV['Mat'], segments: Segment[]): Segment[] {
  if (!matIsBinaryInkMat(mat)) return segments
  const data = mat.data instanceof Uint8Array ? mat.data : new Uint8Array(mat.data)
  return postProcessBinarySegments(mat.cols, mat.rows, data, segments)
}

export function detectLineSegments(
  cv: OpenCV,
  gray: OpenCV['Mat'],
  mode: 'hough' | 'lsd' | 'both' = 'both',
): BaselineResult {
  const hough = mode === 'lsd' ? [] : detectHoughSegments(cv, gray)
  const lsd = mode === 'hough' ? [] : detectLsdSegments(cv, gray)
  const merged = mode === 'hough' ? hough : mode === 'lsd' ? lsd : dedupeSegments(hough, lsd)
  const finalized = finalizeSegments(gray, merged)

  return {
    segments: finalized.slice(0, MAX_LINES),
    lineCount: finalized.length,
    truncated: merged.length > MAX_LINES,
    houghCount: hough.length,
    lsdCount: lsd.length,
    mergedCount: finalized.length,
  }
}
