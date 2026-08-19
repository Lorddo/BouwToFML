import type {
  RoomWallMaskRle,
  RoomWallSemanticGraph,
  SemanticWallSegment,
} from '@/core/extraction/types'
import type { OpenCV } from '@/cv/loadOpenCV'
import { decodeMaskRle } from '@/cv/util/binary-mask-rle'
import { floorplannerLeftNormal } from '@/core/fml/fml-wall-geom'
import {
  isDominantHorizontal,
  isDominantVertical,
  segmentAngleDeg,
} from '@/cv/walls/rooms/wall-segment-geometry'

function segmentLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

const MEDIAN_THICKNESS_SAMPLE_CAP = 40
const THICKNESS_REF_FALLBACK_PX = 30
/**
 * Kern-fractie voor korte segmenten: i.p.v. junction-trim uit te zetten
 * (dan meet je 100% in knopen) sampelen we t ∈ [f, 1−f].
 */
const THICKNESS_CORE_FRACTION = 0.3

function resolveThicknessRefPx(referenceWallThicknessPx?: number): number {
  return referenceWallThicknessPx && referenceWallThicknessPx > 0
    ? referenceWallThicknessPx
    : THICKNESS_REF_FALLBACK_PX
}

function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[index] ?? 0
}

/** Blijf weg van knooppunten bij diktemeting: 1 × ref (was vaste 30). */
function resolveJunctionThicknessMarginPx(referenceWallThicknessPx?: number): number {
  return Math.max(1, Math.round(resolveThicknessRefPx(referenceWallThicknessPx)))
}

/** Endpoint-snap voor collineaire muurlijn-ketens: 0.3 × ref (was vaste 8). */
function resolveWallLineSnapPx(referenceWallThicknessPx?: number): number {
  return Math.max(1, Math.round(resolveThicknessRefPx(referenceWallThicknessPx) * 0.3))
}

/** Max loodrechte offset opzelfde centerline: 0.2 × ref (was vaste 6). */
function resolveWallLineParallelSepPx(referenceWallThicknessPx?: number): number {
  return Math.max(1, Math.round(resolveThicknessRefPx(referenceWallThicknessPx) * 0.2))
}

/** @deprecated Prefer resolveJunctionThicknessMarginPx(ref). Default = ref 30. */
export const JUNCTION_THICKNESS_MARGIN_PX = resolveJunctionThicknessMarginPx()
const WALL_LINE_SNAP_PX = resolveWallLineSnapPx()
/** Hoekdrempel: segmenten op één lijn vs hoek/tak. */
const WALL_LINE_COLLINEAR_MIN_TURN_DEG = 12
const WALL_LINE_PARALLEL_SEP_PX = resolveWallLineParallelSepPx()

export function buildWallDistanceMap(params: {
  cv: OpenCV
  maskRle: RoomWallMaskRle
}): { mask: Uint8Array; distanceMap: Float32Array } | null {
  const mask = decodeMaskRle(params.maskRle)
  const distanceMap = buildDistanceMapFromMask({
    cv: params.cv,
    mask,
    width: params.maskRle.width,
    height: params.maskRle.height,
  })
  if (!distanceMap) return null
  return { mask, distanceMap }
}

/** Distance transform on a raw 0/255 wall mask (no RLE roundtrip). */
function buildDistanceMapFromMask(params: {
  cv: OpenCV
  mask: Uint8Array
  width: number
  height: number
}): Float32Array | null {
  return buildDistanceMap(params)
}

function trimSegmentEndsForThickness(
  a: { x: number; y: number },
  b: { x: number; y: number },
  marginPx: number,
): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const len = segmentLength(a, b)
  if (len <= 1e-6) {
    return { a: { ...a }, b: { ...b } }
  }
  // Korte segmenten: kern sampelen i.p.v. trim uitzetten (anders meet je knoopblobs).
  if (marginPx <= 0 || len <= marginPx * 2 + 1) {
    const t0 = THICKNESS_CORE_FRACTION
    const t1 = 1 - THICKNESS_CORE_FRACTION
    return {
      a: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
      b: { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
    }
  }
  const t0 = marginPx / len
  const t1 = 1 - marginPx / len
  return {
    a: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
    b: { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
  }
}

function sampleSegmentPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  sampleStepPx: number,
  junctionMarginPx = 0,
): Array<{ x: number; y: number }> {
  const trimmed =
    junctionMarginPx > 0 ? trimSegmentEndsForThickness(a, b, junctionMarginPx) : { a, b }
  const len = segmentLength(trimmed.a, trimmed.b)
  if (len <= 1e-6) return [{ x: trimmed.a.x, y: trimmed.a.y }]
  const steps = Math.max(1, Math.ceil(len / Math.max(1, sampleStepPx)))
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    points.push({
      x: trimmed.a.x + (trimmed.b.x - trimmed.a.x) * t,
      y: trimmed.a.y + (trimmed.b.y - trimmed.a.y) * t,
    })
  }
  return points
}

function walkToBackground(
  mask: Uint8Array,
  width: number,
  height: number,
  start: { x: number; y: number },
  direction: { x: number; y: number },
  maxDistance = 512,
): number {
  let distance = 0
  for (let step = 1; step <= maxDistance; step += 1) {
    const x = Math.round(start.x + direction.x * step)
    const y = Math.round(start.y + direction.y * step)
    if (x < 0 || y < 0 || x >= width || y >= height) break
    if ((mask[y * width + x] ?? 0) < 128) break
    distance += 1
  }
  return distance
}

function sampleThicknessFallback(params: {
  mask: Uint8Array
  width: number
  height: number
  a: { x: number; y: number }
  b: { x: number; y: number }
  sampleStepPx: number
  junctionMarginPx?: number
}): number[] {
  const { mask, width, height, sampleStepPx } = params
  const trimmed = trimSegmentEndsForThickness(
    params.a,
    params.b,
    params.junctionMarginPx ?? JUNCTION_THICKNESS_MARGIN_PX,
  )
  const dx = trimmed.b.x - trimmed.a.x
  const dy = trimmed.b.y - trimmed.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return [0]
  const nx = -dy / len
  const ny = dx / len
  const samples = sampleSegmentPoints(trimmed.a, trimmed.b, sampleStepPx, 0)
  const values: number[] = []
  for (const sample of samples) {
    const cx = Math.round(sample.x)
    const cy = Math.round(sample.y)
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
    if ((mask[cy * width + cx] ?? 0) < 128) continue
    const plus = walkToBackground(mask, width, height, sample, { x: nx, y: ny })
    const minus = walkToBackground(mask, width, height, sample, { x: -nx, y: -ny })
    values.push(Math.max(0, plus + minus))
  }
  return values.length > 0 ? values : [0]
}

interface NormalExtentSample {
  plus: number
  minus: number
}

function sampleNormalExtents(params: {
  mask: Uint8Array
  width: number
  height: number
  a: { x: number; y: number }
  b: { x: number; y: number }
  sampleStepPx: number
  junctionMarginPx?: number
}): NormalExtentSample[] {
  const { mask, width, height, sampleStepPx } = params
  const trimmed = trimSegmentEndsForThickness(
    params.a,
    params.b,
    params.junctionMarginPx ?? JUNCTION_THICKNESS_MARGIN_PX,
  )
  const dx = trimmed.b.x - trimmed.a.x
  const dy = trimmed.b.y - trimmed.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return []
  const n = floorplannerLeftNormal({ x: dx / len, y: dy / len })
  const nx = n.x
  const ny = n.y
  const samples = sampleSegmentPoints(trimmed.a, trimmed.b, sampleStepPx, 0)
  const values: NormalExtentSample[] = []
  for (const sample of samples) {
    const cx = Math.round(sample.x)
    const cy = Math.round(sample.y)
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
    if ((mask[cy * width + cx] ?? 0) < 128) continue
    const plus = walkToBackground(mask, width, height, sample, { x: nx, y: ny })
    const minus = walkToBackground(mask, width, height, sample, { x: -nx, y: -ny })
    if (plus + minus <= 0) continue
    values.push({ plus, minus })
  }
  return values
}

function sampleThicknessFromDistanceMap(params: {
  distanceMap: Float32Array
  width: number
  height: number
  a: { x: number; y: number }
  b: { x: number; y: number }
  sampleStepPx: number
  junctionMarginPx?: number
}): number[] {
  const { distanceMap, width, height, sampleStepPx } = params
  const trimmed = trimSegmentEndsForThickness(
    params.a,
    params.b,
    params.junctionMarginPx ?? JUNCTION_THICKNESS_MARGIN_PX,
  )
  const samples = sampleSegmentPoints(trimmed.a, trimmed.b, sampleStepPx, 0)
  const values: number[] = []
  for (const sample of samples) {
    const x = Math.round(sample.x)
    const y = Math.round(sample.y)
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const value = distanceMap[y * width + x] ?? 0
    if (!Number.isFinite(value) || value <= 0) continue
    values.push(value * 2)
  }
  return values
}

function buildDistanceMap(params: {
  cv: OpenCV
  mask: Uint8Array
  width: number
  height: number
}): Float32Array | null {
  const { cv, mask, width, height } = params
  const src = cv.matFromArray(height, width, cv.CV_8UC1, mask)
  const dist = new cv.Mat()
  try {
    cv.distanceTransform(src, dist, cv.DIST_L2 ?? 2, cv.DIST_MASK_3 ?? 3)
    const data32 = (dist.data32F as Float32Array | undefined) ?? null
    if (!data32 || !data32.length) return null
    return new Float32Array(data32)
  } catch {
    return null
  } finally {
    dist.delete()
    src.delete()
  }
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function collectSegmentThicknessSamples(params: {
  mask: Uint8Array
  width: number
  height: number
  a: { x: number; y: number }
  b: { x: number; y: number }
  sampleStepPx: number
  distanceMap?: Float32Array | null
  junctionMarginPx?: number
  referenceWallThicknessPx?: number
}): number[] {
  const margin =
    params.junctionMarginPx ?? resolveJunctionThicknessMarginPx(params.referenceWallThicknessPx)
  if (params.distanceMap) {
    const byDt = sampleThicknessFromDistanceMap({
      distanceMap: params.distanceMap,
      width: params.width,
      height: params.height,
      a: params.a,
      b: params.b,
      sampleStepPx: params.sampleStepPx,
      junctionMarginPx: margin,
    })
    if (byDt.length > 0) return byDt
  }
  return sampleThicknessFallback({ ...params, junctionMarginPx: margin })
}

export function estimateMedianThicknessPx(params: {
  maskRle: RoomWallMaskRle
  segments: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>
  sampleStepPx?: number
  cv?: OpenCV
  mask?: Uint8Array
  distanceMap?: Float32Array | null
  maxSegments?: number
}): number {
  if (!params.segments.length) return 0
  const sampleStepPx = params.sampleStepPx ?? 5
  const mask = params.mask ?? decodeMaskRle(params.maskRle)
  const distanceMap =
    params.distanceMap ??
    (params.cv
      ? buildDistanceMap({
          cv: params.cv,
          mask,
          width: params.maskRle.width,
          height: params.maskRle.height,
        })
      : null)
  const sorted = [...params.segments].sort(
    (a, b) => segmentLength(b.a, b.b) - segmentLength(a.a, a.b),
  )
  const capped = sorted.slice(0, params.maxSegments ?? MEDIAN_THICKNESS_SAMPLE_CAP)
  const values: number[] = []
  for (const segment of capped) {
    values.push(
      ...collectSegmentThicknessSamples({
        mask,
        width: params.maskRle.width,
        height: params.maskRle.height,
        a: segment.a,
        b: segment.b,
        sampleStepPx,
        distanceMap,
      }),
    )
  }
  return median(values)
}

function undirectedAngleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 180
  if (d > 90) d = 180 - d
  return d
}

function areCollinearSegments(a: SemanticWallSegment, b: SemanticWallSegment): boolean {
  return (
    undirectedAngleDiffDeg(segmentAngleDeg(a), segmentAngleDeg(b)) <
    WALL_LINE_COLLINEAR_MIN_TURN_DEG
  )
}

function sharedSegmentEndpoint(
  a: SemanticWallSegment,
  b: SemanticWallSegment,
  snapPx: number,
): { x: number; y: number } | null {
  const pairs = [
    [a.a, b.a],
    [a.a, b.b],
    [a.b, b.a],
    [a.b, b.b],
  ] as const
  for (const [pa, pb] of pairs) {
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= snapPx) {
      return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
    }
  }
  return null
}

function perpendicularOffsetPx(a: SemanticWallSegment, b: SemanticWallSegment): number {
  if (isDominantHorizontal(a)) {
    return Math.abs((a.a.y + a.b.y) / 2 - (b.a.y + b.b.y) / 2)
  }
  if (isDominantVertical(a)) {
    return Math.abs((a.a.x + a.b.x) / 2 - (b.a.x + b.b.x) / 2)
  }
  const dx = a.b.x - a.a.x
  const dy = a.b.y - a.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return 0
  const nx = -dy / len
  const ny = dx / len
  const midB = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 }
  return Math.abs((midB.x - a.a.x) * nx + (midB.y - a.a.y) * ny)
}

function directionFromEndpoint(
  segment: SemanticWallSegment,
  point: { x: number; y: number },
  snapPx: number,
): { x: number; y: number } | null {
  const nearA = Math.hypot(segment.a.x - point.x, segment.a.y - point.y) <= snapPx
  const nearB = Math.hypot(segment.b.x - point.x, segment.b.y - point.y) <= snapPx
  if (!nearA && !nearB) return null
  const dx = segment.b.x - segment.a.x
  const dy = segment.b.y - segment.a.y
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return null
  if (nearA && !nearB) return { x: dx / len, y: dy / len }
  if (nearB && !nearA) return { x: -dx / len, y: -dy / len }
  return null
}

/** Twee segmenten horen bij dezelfde muurlijn als ze collineair doorlopen op hetzelfde centerline-pad. */
export function segmentsOnSameWallLine(
  a: SemanticWallSegment,
  b: SemanticWallSegment,
  snapPx = WALL_LINE_SNAP_PX,
  parallelSepPx = WALL_LINE_PARALLEL_SEP_PX,
): boolean {
  const shared = sharedSegmentEndpoint(a, b, snapPx)
  if (!shared) return false
  if (!areCollinearSegments(a, b)) return false
  if (perpendicularOffsetPx(a, b) > parallelSepPx) return false
  const dirA = directionFromEndpoint(a, shared, snapPx)
  const dirB = directionFromEndpoint(b, shared, snapPx)
  if (!dirA || !dirB) return false
  const dot = dirA.x * dirB.x + dirA.y * dirB.y
  const minOppositeDot = -Math.cos((WALL_LINE_COLLINEAR_MIN_TURN_DEG * Math.PI) / 180)
  return dot <= minOppositeDot
}

class UnionFind {
  private parent: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index)
  }

  find(index: number): number {
    let root = index
    while (this.parent[root] !== root) root = this.parent[root]
    let current = index
    while (current !== root) {
      const next = this.parent[current]
      this.parent[current] = root
      current = next
    }
    return root
  }

  union(a: number, b: number): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return
    this.parent[rootB] = rootA
  }
}

/** Groepeer segmentindices die op één rechte muurlijn liggen (keten tussen hoeken/takken). */
export function groupWallLineIndices(
  segments: SemanticWallSegment[],
  snapPx = WALL_LINE_SNAP_PX,
  referenceWallThicknessPx?: number,
): number[][] {
  if (segments.length <= 1) return segments.map((_, index) => [index])
  const resolvedSnap = referenceWallThicknessPx
    ? resolveWallLineSnapPx(referenceWallThicknessPx)
    : snapPx
  const parallelSepPx = resolveWallLineParallelSepPx(referenceWallThicknessPx)
  const uf = new UnionFind(segments.length)
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (segmentsOnSameWallLine(segments[i], segments[j], resolvedSnap, parallelSepPx)) {
        uf.union(i, j)
      }
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < segments.length; i += 1) {
    const root = uf.find(i)
    const bucket = groups.get(root) ?? []
    bucket.push(i)
    groups.set(root, bucket)
  }
  return [...groups.values()]
}

/** Geef alle segmenten op dezelfde muurlijn de dikste gemeten dikte (en balance van dat segment). */
export function harmonizeThicknessPerWallLine(
  segments: SemanticWallSegment[],
): SemanticWallSegment[] {
  if (segments.length <= 1) return segments
  const groups = groupWallLineIndices(segments)
  const result = segments.map((segment) => ({ ...segment }))
  for (const group of groups) {
    if (group.length <= 1) continue
    let bestIndex = group[0]
    for (const index of group) {
      const typical = result[index]?.thicknessPxTypical ?? result[index]?.thicknessPxMax ?? 0
      const bestTypical =
        result[bestIndex]?.thicknessPxTypical ?? result[bestIndex]?.thicknessPxMax ?? 0
      if (typical > bestTypical) {
        bestIndex = index
      }
    }
    const best = result[bestIndex]
    const thicknessPxMax = best?.thicknessPxMax ?? 0
    const thicknessPxTypical = best?.thicknessPxTypical
    const thicknessPxP90 = best?.thicknessPxP90
    const balancePx = best?.balancePx
    const facePlusPx = best?.facePlusPx
    const faceMinusPx = best?.faceMinusPx
    for (const index of group) {
      result[index] = {
        ...result[index],
        thicknessPxMax,
        thicknessPxTypical,
        thicknessPxP90,
        balancePx,
        facePlusPx,
        faceMinusPx,
      }
    }
  }
  return result
}

export function measureSegmentThicknessMax(params: {
  graph: RoomWallSemanticGraph
  maskRle: RoomWallMaskRle
  sampleStepPx?: number
  cv?: OpenCV
  mask?: Uint8Array
  distanceMap?: Float32Array | null
  /** Houd false voor FML-ketenlogica; true behoudt legacy lijn-harmonisatie. */
  harmonizeByWallLine?: boolean
  referenceWallThicknessPx?: number
}): RoomWallSemanticGraph {
  const sampleStepPx = params.sampleStepPx ?? 5
  const mask = params.mask ?? decodeMaskRle(params.maskRle)
  const width = params.maskRle.width
  const height = params.maskRle.height
  const distanceMap =
    params.distanceMap ??
    (params.cv
      ? buildDistanceMap({
          cv: params.cv,
          mask,
          width,
          height,
        })
      : null)
  const junctionMarginPx = resolveJunctionThicknessMarginPx(params.referenceWallThicknessPx)

  const segments = params.graph.segments.map((segment) => {
    const samples = collectSegmentThicknessSamples({
      mask,
      width,
      height,
      a: segment.a,
      b: segment.b,
      sampleStepPx,
      distanceMap,
      junctionMarginPx,
      referenceWallThicknessPx: params.referenceWallThicknessPx,
    })
    const thicknessPxMax = samples.length ? Math.max(...samples) : 0
    const thicknessPxTypical = samples.length ? median(samples) : 0
    const sortedSamples = samples.length ? [...samples].sort((a, b) => a - b) : []
    const thicknessPxP90 = samples.length ? quantileSorted(sortedSamples, 0.9) : 0
    const normalExtents = sampleNormalExtents({
      mask,
      width,
      height,
      a: segment.a,
      b: segment.b,
      sampleStepPx,
      junctionMarginPx,
    })
    const plusMedian = median(normalExtents.map((sample) => sample.plus))
    const minusMedian = median(normalExtents.map((sample) => sample.minus))
    const balanceDenominator = plusMedian + minusMedian
    // Floorplanner: balance = fractie aan de linkerzijde van a→b (Y-down).
    const balancePx =
      Number.isFinite(balanceDenominator) && balanceDenominator > 0
        ? plusMedian / balanceDenominator
        : undefined
    return {
      ...segment,
      thicknessPxMax,
      thicknessPxTypical,
      thicknessPxP90,
      balancePx,
      facePlusPx: normalExtents.length > 0 ? plusMedian : undefined,
      faceMinusPx: normalExtents.length > 0 ? minusMedian : undefined,
    }
  })

  return {
    ...params.graph,
    segments:
      params.harmonizeByWallLine === false ? segments : harmonizeThicknessPerWallLine(segments),
  }
}
